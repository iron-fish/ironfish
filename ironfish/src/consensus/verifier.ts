/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BufferSet } from 'buffer-map'
import { Assert } from '../assert'
import { Blockchain } from '../blockchain'
import {
  getBlockSize,
  getBlockWithMinersFeeSize,
  getTransactionSize,
} from '../network/utils/serializers'
import { Spend } from '../primitives'
import { Block } from '../primitives/block'
import { BlockHeader, transactionCommitment } from '../primitives/blockheader'
import { Target } from '../primitives/target'
import { Transaction } from '../primitives/transaction'
import { IDatabaseTransaction } from '../storage'
import { WorkerPool } from '../workerPool'
import { ALLOWED_BLOCK_FUTURE_SECONDS, GENESIS_BLOCK_SEQUENCE } from './consensus'

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
    if (
      this.chain.consensus.isActive(
        this.chain.consensus.V2_MAX_BLOCK_SIZE,
        block.header.sequence,
      )
    ) {
      if (getBlockSize(block) > this.chain.consensus.MAX_BLOCK_SIZE_BYTES) {
        return { valid: false, reason: VerificationResultReason.MAX_BLOCK_SIZE_EXCEEDED }
      }
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

    // Verify the transactions
    const notesLimit = 10
    const verificationPromises = []

    let transactionBatch = []
    let runningNotesCount = 0
    for (const [idx, tx] of block.transactions.entries()) {
      if (this.isExpiredSequence(tx.expirationSequence(), block.header.sequence)) {
        return {
          valid: false,
          reason: VerificationResultReason.TRANSACTION_EXPIRED,
        }
      }

      transactionBatch.push(tx)

      runningNotesCount += tx.notesLength()

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

    // Sum the totalTransactionFees and minersFee
    let totalTransactionFees = BigInt(0)
    let minersFee = BigInt(0)

    const transactionFees = await Promise.all(block.transactions.map((t) => t.fee()))

    for (let i = 0; i < transactionFees.length; i++) {
      const fee = transactionFees[i]

      // Miner's fee should be only the first transaction
      if (i === 0 && fee > 0) {
        return { valid: false, reason: VerificationResultReason.MINERS_FEE_EXPECTED }
      }

      if (i !== 0 && fee < 0) {
        return { valid: false, reason: VerificationResultReason.INVALID_TRANSACTION_FEE }
      }

      if (fee > 0) {
        totalTransactionFees += fee
      }
      if (fee < 0) {
        minersFee += fee
      }
    }

    // minersFee should be (negative) miningReward + totalTransactionFees
    const miningReward = this.chain.strategy.miningReward(block.header.sequence)
    if (minersFee !== BigInt(-1) * (BigInt(miningReward) + totalTransactionFees)) {
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
   *  *  miners fee contains only one output note and no spends
   *  *  miners fee is a valid transaction
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

    if (blockHeader.timestamp.getTime() > Date.now() + ALLOWED_BLOCK_FUTURE_SECONDS * 1000) {
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

    if (
      current.timestamp.getTime() <
      previousHeader.timestamp.getTime() - ALLOWED_BLOCK_FUTURE_SECONDS * 1000
    ) {
      return { valid: false, reason: VerificationResultReason.BLOCK_TOO_OLD }
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
    let verificationResult = this.chain.verifier.verifyCreatedTransaction(transaction)
    if (!verificationResult.valid) {
      return verificationResult
    }

    try {
      verificationResult = await this.workerPool.verify(transaction)
    } catch {
      verificationResult = { valid: false, reason: VerificationResultReason.VERIFY_TRANSACTION }
    }

    if (!verificationResult.valid) {
      return verificationResult
    }

    const reason = await this.chain.db.withTransaction(null, async (tx) => {
      const nullifierSize = await this.chain.nullifiers.size(tx)

      for (const spend of transaction.spends()) {
        // If the spend references a larger tree size, allow it, so it's possible to
        // store transactions made while the node is a few blocks behind
        // TODO: We're not calling verifySpend here because we're often creating spends with tree size
        // + root at the head of the chain, rather than a reasonable confirmation range back. These blocks
        // (and spends) can eventually become valid if the chain forks to them.
        // Calculating the notes rootHash is also expensive at the time of writing, so performance test
        // before verifying the rootHash on spends.
        if (await this.chain.nullifiers.contained(spend.nullifier, nullifierSize, tx)) {
          return VerificationResultReason.DOUBLE_SPEND
        }
      }
    })

    if (reason) {
      return { valid: false, reason }
    }

    return { valid: true }
  }

  /**
   * Verify that a transaction created by the account can be accepted into the mempool
   * and rebroadcasted to the network.
   */
  verifyCreatedTransaction(transaction: Transaction): VerificationResult {
    if (
      getTransactionSize(transaction) >
      this.chain.consensus.MAX_BLOCK_SIZE_BYTES - getBlockWithMinersFeeSize()
    ) {
      return { valid: false, reason: VerificationResultReason.MAX_TRANSACTION_SIZE_EXCEEDED }
    }

    return { valid: true }
  }

  async verifyTransactionSpends(
    transaction: Transaction,
    tx?: IDatabaseTransaction,
  ): Promise<VerificationResult> {
    return this.chain.db.withTransaction(tx, async (tx) => {
      const notesSize = await this.chain.notes.size(tx)

      for (const spend of transaction.spends()) {
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

    validity = await this.workerPool.verify(transaction)
    return validity
  }

  isExpiredSequence(expirationSequence: number, sequence: number): boolean {
    return expirationSequence !== 0 && expirationSequence <= sequence
  }

  /**
   * Verify that the target of this block is correct against the block before it.
   */
  protected isValidTarget(header: BlockHeader, previous: BlockHeader): boolean {
    if (!this.enableVerifyTarget) {
      return true
    }

    const expectedTarget = Target.calculateTarget(
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

    verification = await this.verifyBlock(block)
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
    return this.chain.db.withTransaction(tx, async (tx) => {
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
    const seen = new BufferSet()

    for (const spend of block.spends()) {
      if (seen.has(spend.nullifier)) {
        return { valid: false, reason: VerificationResultReason.DOUBLE_SPEND }
      }

      if (await this.chain.nullifiers.contains(spend.nullifier, tx)) {
        return { valid: false, reason: VerificationResultReason.DOUBLE_SPEND }
      }

      seen.add(spend.nullifier)
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
    return this.chain.db.withTransaction(tx, async (tx) => {
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
}

export enum VerificationResultReason {
  BLOCK_TOO_OLD = 'Block timestamp is in past',
  DESERIALIZATION = 'Failed to deserialize',
  DOUBLE_SPEND = 'Double spend',
  DUPLICATE = 'Duplicate',
  ERROR = 'Error',
  GRAFFITI = 'Graffiti field is not 32 bytes in length',
  HASH_NOT_MEET_TARGET = 'Hash does not meet target',
  INVALID_MINERS_FEE = "Miner's fee is incorrect",
  INVALID_SPEND = 'Invalid spend',
  INVALID_TARGET = 'Invalid target',
  INVALID_TRANSACTION_FEE = 'Transaction fee is incorrect',
  INVALID_TRANSACTION_PROOF = 'Invalid transaction proof',
  INVALID_TRANSACTION_COMMITMENT = 'Transaction commitment does not match transactions',
  INVALID_PARENT = 'Invalid_parent',
  MAX_BLOCK_SIZE_EXCEEDED = 'Block size exceeds maximum',
  MAX_TRANSACTION_SIZE_EXCEEDED = 'Transaction size exceeds maximum',
  MINERS_FEE_EXPECTED = 'Miners fee expected',
  NOTE_COMMITMENT = 'Note_commitment',
  NOTE_COMMITMENT_SIZE_TOO_LARGE = 'Note commitment tree is smaller than referenced by the spend',
  ORPHAN = 'Block is an orphan',
  PREV_HASH_NULL = 'Previous block hash is null',
  PREV_HASH_MISMATCH = 'Previous block hash does not match expected hash',
  SEQUENCE_OUT_OF_ORDER = 'Block sequence is out of order',
  TOO_FAR_IN_FUTURE = 'Timestamp is in future',
  TRANSACTION_EXPIRED = 'Transaction expired',
  VERIFY_TRANSACTION = 'Verify_transaction',
}

/**
 * Indicate whether some entity is valid, and if not, provide a reason and
 * hash.
 */
export interface VerificationResult {
  valid: boolean
  reason?: VerificationResultReason
}
