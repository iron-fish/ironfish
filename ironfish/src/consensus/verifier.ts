/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset } from '@ironfish/rust-nodejs'
import { BufferMap, BufferSet } from 'buffer-map'
import { Assert } from '../assert'
import { Blockchain } from '../blockchain'
import {
  getBlockSize,
  getBlockWithMinersFeeSize,
  getTransactionSize,
} from '../network/utils/serializers'
import { Spend } from '../primitives'
import { Block, GENESIS_BLOCK_SEQUENCE } from '../primitives/block'
import { BlockHeader, transactionCommitment } from '../primitives/blockheader'
import { BurnDescription } from '../primitives/burnDescription'
import { MintDescription } from '../primitives/mintDescription'
import { Target } from '../primitives/target'
import { Transaction } from '../primitives/transaction'
import { IDatabaseTransaction } from '../storage'
import { BufferUtils } from '../utils/buffer'
import { WorkerPool } from '../workerPool'
import { Consensus } from './consensus'
import { isExpiredSequence } from './utils'

export class Verifier {
  chain: Blockchain
  private readonly workerPool: WorkerPool

  /**
   * Used to disable verifying the target on the Verifier for testing purposes
   */
  enableVerifyTarget = true

  constructor(chain: Blockchain, workerPool: WorkerPool) {
    this.chain = chain
    this.workerPool = workerPool
  }

  /**
   * Verify that the block is internally consistent:
   *  *  Header is valid
   *  *  All transaction proofs are valid
   *  *  Miner's fee is transaction list fees + miner's reward
   */
  async verifyBlock(
    block: Block,
    options: { verifyTarget?: boolean } = { verifyTarget: true },
  ): Promise<VerificationResult> {
    if (getBlockSize(block) > this.chain.consensus.parameters.maxBlockSizeBytes) {
      return { valid: false, reason: VerificationResultReason.MAX_BLOCK_SIZE_EXCEEDED }
    }

    // Verify the block header
    const blockHeaderValid = this.verifyBlockHeader(block.header, options)
    if (!blockHeaderValid.valid) {
      return blockHeaderValid
    }

    const expectedTransactionCommitment = transactionCommitment(block.transactions)
    if (!expectedTransactionCommitment.equals(block.header.transactionCommitment)) {
      return { valid: false, reason: VerificationResultReason.INVALID_TRANSACTION_COMMITMENT }
    }

    const [minersFeeTransaction, ...otherTransactions] = block.transactions

    // Require the miner's fee transaction
    if (!minersFeeTransaction || !minersFeeTransaction.isMinersFee()) {
      return { valid: false, reason: VerificationResultReason.MINERS_FEE_EXPECTED }
    }

    // Verify the transactions
    const transactionVersion = this.chain.consensus.getActiveTransactionVersion(
      block.header.sequence,
    )
    const notesLimit = 10
    const verificationPromises = []

    let transactionBatch = []
    let runningNotesCount = 0
    const transactionHashes = new BufferSet()
    for (const [idx, tx] of block.transactions.entries()) {
      if (tx.version() !== transactionVersion) {
        return {
          valid: false,
          reason: VerificationResultReason.INVALID_TRANSACTION_VERSION,
        }
      }

      if (isExpiredSequence(tx.expiration(), block.header.sequence)) {
        return {
          valid: false,
          reason: VerificationResultReason.TRANSACTION_EXPIRED,
        }
      }

      if (transactionHashes.has(tx.hash())) {
        return {
          valid: false,
          reason: VerificationResultReason.DUPLICATE_TRANSACTION,
        }
      }

      transactionHashes.add(tx.hash())

      const mintVerify = Verifier.verifyMints(tx.mints)
      if (!mintVerify.valid) {
        return mintVerify
      }

      const burnVerify = Verifier.verifyBurns(tx.burns)
      if (!burnVerify.valid) {
        return burnVerify
      }

      transactionBatch.push(tx)

      runningNotesCount += tx.notes.length

      if (runningNotesCount >= notesLimit || idx === block.transactions.length - 1) {
        verificationPromises.push(this.workerPool.verifyTransactions(transactionBatch))

        transactionBatch = []
        runningNotesCount = 0
      }
    }

    const verificationResults = await Promise.all(verificationPromises)

    const invalidResult = verificationResults.find((f) => !f.valid)
    if (invalidResult !== undefined) {
      return invalidResult
    }

    // Sum the total transaction fees
    let totalTransactionFees = 0n
    for (const transaction of otherTransactions) {
      const transactionFee = transaction.fee()
      if (transactionFee < 0) {
        return { valid: false, reason: VerificationResultReason.INVALID_TRANSACTION_FEE }
      }

      if (transactionFee < this.chain.consensus.parameters.minFee) {
        return {
          valid: false,
          reason: VerificationResultReason.MINIMUM_FEE_NOT_MET,
        }
      }

      totalTransactionFees += transaction.fee()
    }

    // minersFee should be (negative) miningReward + totalTransactionFees
    const miningReward = this.chain.network.miningReward(block.header.sequence)

    if (minersFeeTransaction.fee() !== -1n * (BigInt(miningReward) + totalTransactionFees)) {
      return { valid: false, reason: VerificationResultReason.INVALID_MINERS_FEE }
    }

    return { valid: true }
  }

  /**
   * Verify that this block header is internally consistent. Does not verify
   * the trees or its relationship to other blocks on the chain, and does not
   * verify the transactions in the block.
   *
   * Specifically, it verifies that:
   *  *  graffiti is the appropriate length
   *  *  the block hash meets the target hash on the block
   *  *  the timestamp is not in future by our local clock time
   */
  verifyBlockHeader(
    blockHeader: BlockHeader,
    options: { verifyTarget?: boolean } = { verifyTarget: true },
  ): VerificationResult {
    if (blockHeader.graffiti.byteLength !== 32) {
      return { valid: false, reason: VerificationResultReason.GRAFFITI }
    }

    if (this.enableVerifyTarget && options.verifyTarget && !blockHeader.verifyTarget()) {
      return { valid: false, reason: VerificationResultReason.HASH_NOT_MEET_TARGET }
    }

    if (
      blockHeader.timestamp.getTime() >
      Date.now() + this.chain.consensus.parameters.allowedBlockFutureSeconds * 1000
    ) {
      return { valid: false, reason: VerificationResultReason.TOO_FAR_IN_FUTURE }
    }

    return { valid: true }
  }

  /**
   * Verify that the header of this block is consistent with the one before it.
   *
   * Specifically, it checks:
   *  -  The block's previousHash equals the hash of the previous block header
   *  -  The timestamp of the block is within a threshold of not being before
   *     the previous block
   *  -  The block sequence has incremented by one
   *  -  The target matches the expected value
   */
  verifyBlockHeaderContextual(
    current: BlockHeader,
    previousHeader: BlockHeader,
  ): VerificationResult {
    if (!current.previousBlockHash.equals(previousHeader.hash)) {
      return { valid: false, reason: VerificationResultReason.PREV_HASH_MISMATCH }
    }

    if (this.chain.consensus.isActive('enforceSequentialBlockTime', current.sequence)) {
      if (current.timestamp.getTime() <= previousHeader.timestamp.getTime()) {
        return { valid: false, reason: VerificationResultReason.BLOCK_TOO_OLD }
      }
    } else {
      if (
        current.timestamp.getTime() <
        previousHeader.timestamp.getTime() -
          this.chain.consensus.parameters.allowedBlockFutureSeconds * 1000
      ) {
        return { valid: false, reason: VerificationResultReason.BLOCK_TOO_OLD }
      }
    }

    if (current.sequence !== previousHeader.sequence + 1) {
      return { valid: false, reason: VerificationResultReason.SEQUENCE_OUT_OF_ORDER }
    }

    if (!this.isValidTarget(current, previousHeader)) {
      return { valid: false, reason: VerificationResultReason.INVALID_TARGET }
    }

    return { valid: true }
  }

  /**
   * Verify that a new transaction received over the network can be accepted into
   * the mempool and rebroadcasted to the network.
   */
  async verifyNewTransaction(transaction: Transaction): Promise<VerificationResult> {
    let verificationResult = Verifier.verifyCreatedTransaction(
      transaction,
      this.chain.consensus,
    )

    if (!verificationResult.valid) {
      return verificationResult
    }

    try {
      verificationResult = await this.workerPool.verifyTransactions([transaction])
    } catch {
      verificationResult = { valid: false, reason: VerificationResultReason.VERIFY_TRANSACTION }
    }

    if (!verificationResult.valid) {
      return verificationResult
    }

    const reason = await this.chain.blockchainDb.db.withTransaction(null, async (tx) => {
      for (const spend of transaction.spends) {
        // If the spend references a larger tree size, allow it, so it's possible to
        // store transactions made while the node is a few blocks behind
        // TODO: We're not calling verifySpend here because we're often creating spends with tree size
        // + root at the head of the chain, rather than a reasonable confirmation range back. These blocks
        // (and spends) can eventually become valid if the chain forks to them.
        // Calculating the notes rootHash is also expensive at the time of writing, so performance test
        // before verifying the rootHash on spends.
        if (await this.chain.nullifiers.contains(spend.nullifier, tx)) {
          return VerificationResultReason.DOUBLE_SPEND
        }
      }

      const { reason } = await this.verifyUnseenTransaction(transaction, tx)
      if (reason) {
        return reason
      }

      const { reason: mintOwnersReason } = await this.verifyMintOwners(transaction.mints, tx)
      if (mintOwnersReason) {
        return mintOwnersReason
      }
    })

    if (reason) {
      return { valid: false, reason }
    }

    return { valid: true }
  }

  static getMaxTransactionBytes(maxBlockSizeBytes: number): number {
    return maxBlockSizeBytes - getBlockWithMinersFeeSize()
  }

  /**
   * Verify that a transaction created by the account can be accepted into the mempool
   * and rebroadcasted to the network.
   */
  static verifyCreatedTransaction(
    transaction: Transaction,
    consensus: Consensus,
  ): VerificationResult {
    if (
      getTransactionSize(transaction) >
      Verifier.getMaxTransactionBytes(consensus.parameters.maxBlockSizeBytes)
    ) {
      return { valid: false, reason: VerificationResultReason.MAX_TRANSACTION_SIZE_EXCEEDED }
    }

    if (transaction.fee() < consensus.parameters.minFee) {
      return {
        valid: false,
        reason: VerificationResultReason.MINIMUM_FEE_NOT_MET,
      }
    }

    const nullifierVerify = this.verifyInternalNullifiers(transaction.spends)
    if (!nullifierVerify.valid) {
      return nullifierVerify
    }

    const mintVerify = this.verifyMints(transaction.mints)
    if (!mintVerify.valid) {
      return mintVerify
    }

    const burnVerify = this.verifyBurns(transaction.burns)
    if (!burnVerify.valid) {
      return burnVerify
    }

    return { valid: true }
  }

  async verifyTransactionSpends(
    transaction: Transaction,
    tx?: IDatabaseTransaction,
  ): Promise<VerificationResult> {
    return this.chain.blockchainDb.db.withTransaction(tx, async (tx) => {
      const notesSize = await this.chain.notes.size(tx)

      for (const spend of transaction.spends) {
        const reason = await this.verifySpend(spend, notesSize, tx)

        if (reason) {
          return { valid: false, reason }
        }

        if (await this.chain.nullifiers.contains(spend.nullifier, tx)) {
          return { valid: false, reason: VerificationResultReason.DOUBLE_SPEND }
        }
      }

      return { valid: true }
    })
  }

  async verifyTransactionAdd(
    transaction: Transaction,
    tx?: IDatabaseTransaction,
  ): Promise<VerificationResult> {
    let validity = await this.verifyTransactionSpends(transaction, tx)

    if (!validity.valid) {
      return validity
    }

    validity = await this.workerPool.verifyTransactions([transaction])
    return validity
  }

  /**
   * Verify that the target of this block is correct against the block before it.
   */
  protected isValidTarget(header: BlockHeader, previous: BlockHeader): boolean {
    if (!this.enableVerifyTarget) {
      return true
    }

    const expectedTarget = Target.calculateTarget(
      this.chain.consensus,
      header.sequence,
      header.timestamp,
      previous.timestamp,
      previous.target,
    )

    return header.target.targetValue === expectedTarget.targetValue
  }

  // TODO: Rename to verifyBlock but merge verifyBlock into this
  async verifyBlockAdd(block: Block, prev: BlockHeader | null): Promise<VerificationResult> {
    if (block.header.sequence === GENESIS_BLOCK_SEQUENCE) {
      return { valid: true }
    }

    if (!prev) {
      return { valid: false, reason: VerificationResultReason.PREV_HASH_NULL }
    }

    let verification = this.verifyBlockHeaderContextual(block.header, prev)
    if (!verification.valid) {
      return verification
    }

    verification = await this.verifyBlock(block, {})
    if (!verification.valid) {
      return verification
    }

    return { valid: true }
  }

  /**
   * Loop over all spends in the block and check that:
   *  -  The nullifier has not previously been spent
   *  -  the note being spent really existed in the tree at the time it was spent
   */
  async verifyConnectedSpends(
    block: Block,
    tx?: IDatabaseTransaction,
  ): Promise<VerificationResult> {
    return this.chain.blockchainDb.db.withTransaction(tx, async (tx) => {
      const previousNotesSize = block.header.noteSize
      Assert.isNotNull(previousNotesSize)

      for (const spend of block.spends()) {
        const verificationError = await this.verifySpend(spend, previousNotesSize, tx)
        if (verificationError) {
          return { valid: false, reason: verificationError }
        }
      }

      return { valid: true }
    })
  }

  /**
   * Verify the block does not contain any double spends before connecting it
   */
  async verifyBlockConnect(
    block: Block,
    tx?: IDatabaseTransaction,
  ): Promise<VerificationResult> {
    const mintOwnersValid = await this.verifyMintOwners(block.mints(), tx)
    if (!mintOwnersValid.valid) {
      return mintOwnersValid
    }

    const result = Verifier.verifyInternalNullifiers(block.spends())
    if (!result.valid) {
      return result
    }

    for (const spend of block.spends()) {
      if (await this.chain.nullifiers.contains(spend.nullifier, tx)) {
        return { valid: false, reason: VerificationResultReason.DOUBLE_SPEND }
      }
    }

    for (const transaction of block.transactions) {
      const result = await this.verifyUnseenTransaction(transaction, tx)
      if (!result.valid) {
        return result
      }
    }
    return { valid: true }
  }

  /**
   * Verify that the root of the notes tree is the one that is actually associated with the
   * spend's spend root.
   *
   * @param spend the spend to be verified
   * @param notesSize the size of the notes tree
   * @param tx optional transaction context within which to check the spends.
   */
  async verifySpend(
    spend: Spend,
    notesSize: number,
    tx?: IDatabaseTransaction,
  ): Promise<VerificationResultReason | undefined> {
    if (spend.size > notesSize) {
      return VerificationResultReason.NOTE_COMMITMENT_SIZE_TOO_LARGE
    }

    try {
      const realSpendRoot = await this.chain.notes.pastRoot(spend.size, tx)
      if (!spend.commitment.equals(realSpendRoot)) {
        return VerificationResultReason.INVALID_SPEND
      }
    } catch {
      return VerificationResultReason.ERROR
    }
  }

  /**
   * Determine whether the notes tree matches the commitment in the provided block.
   *
   * Matching means that the root hash of the tree when the tree is the size
   * specified in the commitment is the same as the commitment. Also verifies the spends,
   * which have commitments as well.
   */
  async verifyConnectedBlock(
    block: Block,
    tx?: IDatabaseTransaction,
  ): Promise<VerificationResult> {
    return this.chain.blockchainDb.db.withTransaction(tx, async (tx) => {
      const header = block.header

      Assert.isNotNull(header.noteSize)
      const noteRoot = await this.chain.notes.pastRoot(header.noteSize, tx)
      if (!noteRoot.equals(header.noteCommitment)) {
        return { valid: false, reason: VerificationResultReason.NOTE_COMMITMENT }
      }

      const spendVerification = await this.verifyConnectedSpends(block, tx)
      if (!spendVerification.valid) {
        return spendVerification
      }

      return { valid: true }
    })
  }

  static verifyMints(mints: MintDescription[]): VerificationResult {
    for (const mint of mints) {
      const humanName = BufferUtils.toHuman(mint.asset.name())
      if (humanName.length === 0) {
        return { valid: false, reason: VerificationResultReason.INVALID_ASSET_NAME }
      }
    }

    return { valid: true }
  }

  static verifyBurns(burns: BurnDescription[]): VerificationResult {
    for (const burn of burns) {
      if (burn.assetId.equals(Asset.nativeId())) {
        return { valid: false, reason: VerificationResultReason.NATIVE_BURN }
      }
    }

    return { valid: true }
  }

  /**
   * Given an iterator over some spends, verify that none of the spends reveal
   * the same nullifier as any other in the group. Should be checked at both the
   * block and transaction level.
   */
  static verifyInternalNullifiers(spends: Iterable<Spend>): VerificationResult {
    const nullifiers = new BufferSet()
    for (const spend of spends) {
      if (nullifiers.has(spend.nullifier)) {
        return { valid: false, reason: VerificationResultReason.DOUBLE_SPEND }
      }

      nullifiers.add(spend.nullifier)
    }

    return { valid: true }
  }

  /**
   * Given a transaction, verify that the hash is not present in the blockchain
   * already. Most of the time, we can count on spends being present, so regular
   * double-spend checks are sufficient. However, if the minimum fee is 0,
   * transactions that do not contain spends could be replayable in some
   * scenarios.
   */
  verifyUnseenTransaction(
    transaction: Transaction,
    tx?: IDatabaseTransaction,
  ): Promise<VerificationResult> {
    return this.chain.blockchainDb.db.withTransaction(tx, async (tx) => {
      if (await this.chain.transactionHashHasBlock(transaction.hash(), tx)) {
        return { valid: false, reason: VerificationResultReason.DUPLICATE_TRANSACTION }
      }

      return { valid: true }
    })
  }

  /**
   * Validates that the given owner for each mint is the correct owner based on
   * the current state of the chain and returns the state of the asset owners
   * after processing the mints, taking into account new mints and ownership
   * transfers. Takes an optional existing BufferMap to use as a starting point.
   */
  async verifyMintOwnersIncremental(
    mints: Iterable<MintDescription>,
    lastKnownAssetOwners?: BufferMap<Buffer>,
    tx?: IDatabaseTransaction,
  ): Promise<{ valid: boolean; assetOwners: BufferMap<Buffer> }> {
    const assetOwners = new BufferMap<Buffer>()

    return this.chain.blockchainDb.db.withTransaction(tx, async (tx) => {
      for (const { asset, owner, transferOwnershipTo } of mints) {
        const assetId = asset.id()

        let existingAssetOwner = assetOwners.get(assetId)

        // This asset has not yet been seen in the given Iterable, so we attempt
        // to look up the owner from the last known asset owners map, if it was
        // provided.
        if (!existingAssetOwner && lastKnownAssetOwners) {
          const lastKnownOwner = lastKnownAssetOwners.get(assetId)
          if (lastKnownOwner) {
            existingAssetOwner = lastKnownOwner
          }
        }

        // This asset has not yet been seen in the given Iterable, so we attempt
        // to look up the owner from the chain database
        if (!existingAssetOwner) {
          const assetValue = await this.chain.getAssetById(assetId, tx)
          if (assetValue) {
            existingAssetOwner = assetValue.owner
          }
        }

        // This asset has not yet been seen in the given Iterable, nor does it
        // exist on the chain. Since this is the initial mint of this asset, the
        // owner must be the creator
        if (!existingAssetOwner) {
          const creator = asset.creator()

          if (!creator.equals(owner)) {
            return { valid: false, assetOwners }
          }

          existingAssetOwner = creator
        }

        if (!existingAssetOwner.equals(owner)) {
          return { valid: false, assetOwners }
        }

        if (transferOwnershipTo) {
          assetOwners.set(assetId, transferOwnershipTo)
        } else if (!assetOwners.has(assetId)) {
          assetOwners.set(assetId, existingAssetOwner)
        }
      }

      return { valid: true, assetOwners }
    })
  }

  /**
   * Validates that the given owner for each mint is the correct owner based on
   * the current state of the chain
   */
  async verifyMintOwners(
    mints: Iterable<MintDescription>,
    tx?: IDatabaseTransaction,
  ): Promise<VerificationResult> {
    const { valid } = await this.verifyMintOwnersIncremental(mints, undefined, tx)
    if (valid) {
      return { valid: true }
    } else {
      return { valid: false, reason: VerificationResultReason.INVALID_MINT_OWNER }
    }
  }
}

export enum VerificationResultReason {
  BLOCK_TOO_OLD = 'Block timestamp is in past',
  DESERIALIZATION = 'Failed to deserialize',
  DOUBLE_SPEND = 'Double spend',
  DUPLICATE = 'Duplicate',
  DUPLICATE_TRANSACTION = 'Transaction is a duplicate',
  ERROR = 'Error',
  GOSSIPED_GENESIS_BLOCK = 'Peer gossiped its genesis block',
  GRAFFITI = 'Graffiti field is not 32 bytes in length',
  HASH_NOT_MEET_TARGET = 'Hash does not meet target',
  INVALID_ASSET_NAME = 'Asset name is blank',
  INVALID_GENESIS_BLOCK = 'Peer is using a different genesis block',
  INVALID_MINERS_FEE = "Miner's fee is incorrect",
  INVALID_MINT_OWNER = 'Mint owner is not consistent with chain state',
  INVALID_PARENT = 'Invalid_parent',
  INVALID_SPEND = 'Invalid spend',
  INVALID_TARGET = 'Invalid target',
  INVALID_TRANSACTION_COMMITMENT = 'Transaction commitment does not match transactions',
  INVALID_TRANSACTION_FEE = 'Transaction fee is incorrect',
  INVALID_TRANSACTION_PROOF = 'Invalid transaction proof',
  INVALID_TRANSACTION_VERSION = 'Invalid transaction version',
  MAX_BLOCK_SIZE_EXCEEDED = 'Block size exceeds maximum',
  MAX_TRANSACTION_SIZE_EXCEEDED = 'Transaction size exceeds maximum',
  MINERS_FEE_EXPECTED = 'Miners fee expected',
  MINIMUM_FEE_NOT_MET = 'Transaction fee is below the minimum required fee',
  NATIVE_BURN = 'Attempting to burn the native asset',
  NOTE_COMMITMENT = 'Note_commitment',
  NOTE_COMMITMENT_SIZE_TOO_LARGE = 'Note commitment tree is smaller than referenced by the spend',
  ORPHAN = 'Block is an orphan',
  PREV_HASH_MISMATCH = 'Previous block hash does not match expected hash',
  PREV_HASH_NULL = 'Previous block hash is null',
  SEQUENCE_OUT_OF_ORDER = 'Block sequence is out of order',
  TOO_FAR_IN_FUTURE = 'Timestamp is in future',
  TRANSACTION_EXPIRED = 'Transaction expired',
  VERIFY_TRANSACTION = 'Verify_transaction',
  CHECKPOINT_REORG = 'Cannot add block that re-orgs past the last checkpoint',
}

/**
 * Indicate whether some entity is valid, and if not, provide a reason and
 * hash.
 */
export interface VerificationResult {
  valid: boolean
  reason?: VerificationResultReason
}
