/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BufferSet } from 'buffer-map'
import { Blockchain } from '../blockchain'
import { PayloadType } from '../network'
import { isNewTransactionPayload } from '../network/messages'
import { Spend } from '../primitives'
import { Block, SerializedBlock } from '../primitives/block'
import { BlockHash, BlockHeader } from '../primitives/blockheader'
import { Target } from '../primitives/target'
import { SerializedTransaction, Transaction } from '../primitives/transaction'
import { IDatabaseTransaction } from '../storage'
import { Strategy } from '../strategy'
import { WorkerPool } from '../workerPool'
import { ALLOWED_BLOCK_FUTURE_SECONDS, GENESIS_BLOCK_SEQUENCE } from './consensus'

export class Verifier {
  strategy: Strategy
  chain: Blockchain

  /**
   * Used to disable verifying the target on the Verifier for testing purposes
   */
  enableVerifyTarget = true

  constructor(chain: Blockchain) {
    this.strategy = chain.strategy
    this.chain = chain
  }

  /**
   * Verify that a new block received over the network has a valid header and
   * list of transactions and extract the deserialized transaction.
   *
   * @param payload an unknown message payload that peerNetwork has received from the network.
   *
   * @returns the deserialized block to be processed by the main handler. Rejects
   * the promise if the block is not valid so the gossip router knows not to
   * forward it to other peers.
   */
  async verifyNewBlock(
    newBlock: SerializedBlock,
    workerPool: WorkerPool,
  ): Promise<{
    block: Block
    serializedBlock: SerializedBlock
  }> {
    if (workerPool.saturated) {
      return Promise.reject('Dropping block because worker pool message queue is full')
    }

    let block
    try {
      block = this.strategy.blockSerde.deserialize(newBlock)
    } catch {
      return Promise.reject('Could not deserialize block')
    }

    const validationResult = await this.verifyBlock(block)
    if (!validationResult.valid) {
      return Promise.reject('Block is invalid')
    }
    return Promise.resolve({ block, serializedBlock: newBlock })
  }

  /**
   * Verify that the block is internally consistent:
   *  *  All transaction proofs are valid
   *  *  Header is valid
   *  *  Miner's fee is transaction list fees + miner's reward
   */
  async verifyBlock(
    block: Block,
    options: { verifyTarget?: boolean } = { verifyTarget: true },
  ): Promise<VerificationResult> {
    // Verify the block header
    const blockHeaderValid = this.verifyBlockHeader(block.header, options)
    if (!blockHeaderValid.valid) {
      return blockHeaderValid
    }

    // Verify the transactions
    const verificationResults = await Promise.all(
      block.transactions.map((t) => this.verifyTransaction(t)),
    )

    const invalidResult = verificationResults.find((f) => !f.valid)
    if (invalidResult !== undefined) {
      return invalidResult
    }

    // Sum the totalTransactionFees and minersFee
    let totalTransactionFees = BigInt(0)
    let minersFee = BigInt(0)

    const transactionFees = await Promise.all(block.transactions.map((t) => t.transactionFee()))

    for (const transactionFee of transactionFees) {
      if (transactionFee > 0) {
        totalTransactionFees += transactionFee
      }
      if (transactionFee < 0) {
        minersFee += transactionFee
      }
    }

    // minersFee should match the block header
    // minersFee should be (negative) miningReward + totalTransactionFees
    if (block.header.minersFee !== minersFee) {
      return { valid: false, reason: VerificationResultReason.INVALID_MINERS_FEE }
    }

    const miningReward = block.header.strategy.miningReward(block.header.sequence)
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
   * Verify that a new transaction received over the network has valid proofs
   * before forwarding it to the network.
   *
   * @params payload an unknown message payload that peerNetwork has received from the network.
   *
   * @returns deserialized transaction to be processed by the main handler.
   */
  async verifyNewTransaction(
    payload: PayloadType,
  ): Promise<{ transaction: Transaction; serializedTransaction: SerializedTransaction }> {
    if (!isNewTransactionPayload(payload)) {
      throw new Error('Payload is not a serialized transaction')
    }

    const transaction = this.strategy.transactionSerde.deserialize(payload.transaction)

    try {
      // Transaction is lazily deserialized, so we use takeReference()
      // to force deserialization errors here
      transaction.takeReference()
    } catch {
      transaction.returnReference()
      throw new Error('Transaction cannot deserialize')
    }

    try {
      if ((await transaction.transactionFee()) < 0) {
        throw new Error('Transaction has negative fees')
      }

      if (!(await this.verifyTransaction(transaction)).valid) {
        throw new Error('Transaction is invalid')
      }
    } finally {
      transaction.returnReference()
    }

    return {
      transaction: transaction,
      serializedTransaction: payload.transaction,
    }
  }

  async verifyTransaction(transaction: Transaction): Promise<VerificationResult> {
    try {
      return await transaction.verify()
    } catch {
      return { valid: false, reason: VerificationResultReason.VERIFY_TRANSACTION }
    }
  }

  /**
   * Verify that the header of this block is consistent with the one before it.
   *
   * Specifically, it checks:
   *  -  The number of notes added is equal to the difference between
   *     commitment sizes
   *  -  The number of nullifiers added is equal to the difference between
   *     commitment sizes
   *  -  The timestamp of the block is within a threshold of not being before
   *     the previous block
   *  -  The block sequence has incremented by one
   */
  isValidAgainstPrevious(current: Block, previousHeader: BlockHeader): VerificationResult {
    const { notes, nullifiers } = current.counts()

    if (current.header.noteCommitment.size !== previousHeader.noteCommitment.size + notes) {
      return { valid: false, reason: VerificationResultReason.NOTE_COMMITMENT_SIZE }
    }

    if (
      current.header.nullifierCommitment.size !==
      previousHeader.nullifierCommitment.size + nullifiers
    ) {
      return { valid: false, reason: VerificationResultReason.NULLIFIER_COMMITMENT_SIZE }
    }

    if (
      current.header.timestamp.getTime() <
      previousHeader.timestamp.getTime() - ALLOWED_BLOCK_FUTURE_SECONDS * 1000
    ) {
      return { valid: false, reason: VerificationResultReason.BLOCK_TOO_OLD }
    }

    if (current.header.sequence !== previousHeader.sequence + 1) {
      return { valid: false, reason: VerificationResultReason.SEQUENCE_OUT_OF_ORDER }
    }

    if (!this.isValidTarget(current.header, previousHeader)) {
      return { valid: false, reason: VerificationResultReason.INVALID_TARGET }
    }

    return { valid: true }
  }

  /**
   * Verify that the target of this block is correct aginst the block before it.
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

  /**
   * Loop over all spends in the block and check that:
   *  -  The nullifier has not previously been spent
   *  -  the note being spent really existed in the tree at the time it was spent
   */
  async hasValidSpends(block: Block, tx?: IDatabaseTransaction): Promise<VerificationResult> {
    return this.chain.db.withTransaction(tx, async (tx) => {
      const spendsInThisBlock = Array.from(block.spends())
      const previousSpendCount =
        block.header.nullifierCommitment.size - spendsInThisBlock.length
      const processedSpends = new BufferSet()

      for (const [index, spend] of spendsInThisBlock.entries()) {
        if (processedSpends.has(spend.nullifier)) {
          return { valid: false, reason: VerificationResultReason.DOUBLE_SPEND }
        }

        const verificationError = await this.verifySpend(spend, previousSpendCount + index, tx)
        if (verificationError) {
          return { valid: false, reason: verificationError }
        }

        processedSpends.add(spend.nullifier)
      }

      return { valid: true }
    })
  }

  // TODO: Rename to verifyBlock but merge verifyBlock into this
  async verifyBlockAdd(
    block: Block,
    prev: BlockHeader | null,
    tx: IDatabaseTransaction,
  ): Promise<VerificationResult> {
    if (block.header.sequence === GENESIS_BLOCK_SEQUENCE) {
      return { valid: true }
    }

    if (!prev) {
      return { valid: false, reason: VerificationResultReason.INVALID_PREV_HASH }
    }

    if (!block.header.previousBlockHash.equals(prev.hash)) {
      return { valid: false, reason: VerificationResultReason.INVALID_PREV_HASH }
    }

    return block.withTransactionReferences(async () => {
      let verification = this.isValidAgainstPrevious(block, prev)
      if (!verification.valid) {
        return verification
      }

      verification = await this.verifyBlock(block)
      if (!verification.valid) {
        return verification
      }

      verification = await this.hasValidSpends(block, tx)
      if (!verification.valid) {
        return verification
      }

      return { valid: true }
    })
  }

  /**
   * Verify that the given spend was not in the nullifiers tree when it was the given size,
   * and that the root of the notes tree is the one that is actually associated with the
   * spend's spend root.
   *
   * @param spend the spend to be verified
   * @param size the size of the nullifiers tree at which the spend must not exist
   * @param tx optional transaction context within which to check the spends.
   * TODO as its expensive, this would be a good place for a cache/map of verified Spends
   */
  async verifySpend(
    spend: Spend,
    size: number,
    tx?: IDatabaseTransaction,
  ): Promise<VerificationResultReason | undefined> {
    if (await this.chain.nullifiers.contained(spend.nullifier, size, tx)) {
      return VerificationResultReason.DOUBLE_SPEND
    }
    try {
      const realSpendRoot = await this.chain.notes.pastRoot(spend.size, tx)
      if (!this.strategy.noteHasher.hashSerde().equals(spend.commitment, realSpendRoot)) {
        return VerificationResultReason.INVALID_SPEND
      }
    } catch {
      return VerificationResultReason.ERROR
    }

    // TODO (Elena) need to check trees when genesis - heaviest established
  }

  /**
   * Determine whether our trees match the commitment in the provided block.
   *
   * Matching means that the root hash of the tree when the tree is the size
   * specified in the commitment is the same as the commitment,
   * for both notes and nullifiers trees.
   */
  async blockMatchesTrees(
    header: BlockHeader,
    tx?: IDatabaseTransaction,
  ): Promise<{ valid: boolean; reason: VerificationResultReason | null }> {
    return this.chain.db.withTransaction(tx, async (tx) => {
      const noteSize = header.noteCommitment.size
      const nullifierSize = header.nullifierCommitment.size
      const actualNoteSize = await this.chain.notes.size(tx)
      const actualNullifierSize = await this.chain.nullifiers.size(tx)

      if (noteSize > actualNoteSize) {
        return { valid: false, reason: VerificationResultReason.NOTE_COMMITMENT_SIZE }
      }

      if (nullifierSize > actualNullifierSize) {
        return { valid: false, reason: VerificationResultReason.NULLIFIER_COMMITMENT_SIZE }
      }

      const pastNoteRoot = await this.chain.notes.pastRoot(noteSize, tx)
      if (
        !this.strategy.noteHasher
          .hashSerde()
          .equals(pastNoteRoot, header.noteCommitment.commitment)
      ) {
        return { valid: false, reason: VerificationResultReason.NOTE_COMMITMENT }
      }

      const pastNullifierRoot = await this.chain.nullifiers.pastRoot(nullifierSize, tx)
      if (
        !this.strategy.nullifierHasher
          .hashSerde()
          .equals(pastNullifierRoot, header.nullifierCommitment.commitment)
      ) {
        return { valid: false, reason: VerificationResultReason.NULLIFIER_COMMITMENT }
      }

      return { valid: true, reason: null }
    })
  }
}

export enum VerificationResultReason {
  BLOCK_TOO_OLD = 'Block timestamp is in past',
  ERROR = 'error',
  HASH_NOT_MEET_TARGET = 'hash does not meet target',
  VERIFY_TRANSACTION = 'verify_transaction',
  INVALID_MINERS_FEE = "Miner's fee is incorrect",
  INVALID_TARGET = 'Invalid target',
  INVALID_TRANSACTION_PROOF = 'invalid transaction proof',
  INVALID_PREV_HASH = 'invalid previous hash',
  NOTE_COMMITMENT = 'note_commitment',
  NOTE_COMMITMENT_SIZE = 'Note commitment sizes do not match',
  NULLIFIER_COMMITMENT = 'nullifier_commitment',
  NULLIFIER_COMMITMENT_SIZE = 'Nullifier commitment sizes do not match',
  SEQUENCE_OUT_OF_ORDER = 'Block sequence is out of order',
  TOO_FAR_IN_FUTURE = 'timestamp is in future',
  GRAFFITI = 'Graffiti field is not 32 bytes in length',
  DOUBLE_SPEND = 'Double spend',
  INVALID_SPEND = 'Invalid spend',
  ORPHAN = 'Block is an orphan',
  DUPLICATE = 'duplicate',
}

/**
 * Indicate whether some entity is valid, and if not, provide a reason and
 * hash.
 */
export interface VerificationResult {
  valid: boolean
  reason?: VerificationResultReason
  hash?: BlockHash
}
