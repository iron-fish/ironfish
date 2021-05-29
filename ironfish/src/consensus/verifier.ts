/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ALLOWED_BLOCK_FUTURE_SECONDS, GENESIS_BLOCK_SEQUENCE } from './consensus'
import { Block, SerializedBlock } from '../primitives/block'
import { Blockchain } from '../blockchain'
import { BlockHash, BlockHeader } from '../primitives/blockheader'
import { IDatabaseTransaction } from '../storage'
import {
  IronfishNoteEncrypted,
  SerializedWasmNoteEncrypted,
  SerializedWasmNoteEncryptedHash,
  WasmNoteEncryptedHash,
} from '../primitives/noteEncrypted'
import { isNewTransactionPayload } from '../network/messages'
import { PayloadType } from '../network'
import { JsonSerializable } from '../serde'
import {
  IronfishTransaction,
  SerializedTransaction,
  Transaction,
  Spend,
} from '../primitives/transaction'
import { Strategy } from '../strategy'
import { Target } from '../primitives/target'
import { WorkerPool } from '../workerPool'

/**
 * Verifier transctions and blocks
 *
 * @typeParam E IronfishNoteEncrypted
 *              Note element stored in transactions and the notes Merkle Tree
 * @typeParam H WasmNoteEncryptedHash
 *              the hash of an `E`. Used for the internal nodes and root hash
 *              of the notes Merkle Tree
 * @typeParam T Transaction
 *              Type of a transaction stored on the Blockchain
 * @typeParam SE SerializedWasmNoteEncrypted
 * @typeParam SH SerializedWasmNoteEncryptedHash
 * @typeParam ST SerializedTransaction
 *               The serialized format of a `T`. Conversion between the two happens
 *               via the `strategy`.
 */
export class Verifier<
  E,
  H,
  T extends Transaction<E, H>,
  SE extends JsonSerializable,
  SH extends JsonSerializable,
  ST
> {
  strategy: Strategy<E, H, T, SE, SH, ST>
  chain: Blockchain<E, H, T, SE, SH, ST>

  /**
   * Used to disable verifying the target on the Verifier for testing purposes
   */
  protected enableVerifyTarget = true

  constructor(chain: Blockchain<E, H, T, SE, SH, ST>) {
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
    newBlock: SerializedBlock<SH, ST>,
    workerPool: WorkerPool,
  ): Promise<{ block: Block<E, H, T, SE, SH, ST>; serializedBlock: SerializedBlock<SH, ST> }> {
    if (workerPool.isMessageQueueFull()) {
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
    block: Block<E, H, T, SE, SH, ST>,
    options: { verifyTarget?: boolean } = { verifyTarget: true },
  ): Promise<VerificationResult> {
    // Verify the block header
    const blockHeaderValid = this.verifyBlockHeader(block.header, options)
    if (!blockHeaderValid.valid) {
      return blockHeaderValid
    }

    // Verify the transactions
    const verificationResults = await Promise.all(block.transactions.map((t) => t.verify()))

    const invalidResult = verificationResults.find((f) => !f.valid)
    if (invalidResult !== undefined) {
      return invalidResult
    }

    // Sum the totalTransactionFees and minersFee
    let totalTransactionFees = BigInt(0)
    let minersFee = BigInt(0)

    const transactionFees = await Promise.all(block.transactions.map((t) => t.transactionFee()))

    for (const transactionFee of transactionFees) {
      if (transactionFee > 0) totalTransactionFees += transactionFee
      if (transactionFee < 0) minersFee += transactionFee
    }

    // minersFee should match the block header
    // minersFee should be (negative) miningReward + totalTransactionFees
    if (block.header.minersFee !== minersFee) {
      return { valid: Validity.No, reason: VerificationResultReason.INVALID_MINERS_FEE }
    }

    const miningReward = block.header.strategy.miningReward(block.header.sequence)
    if (minersFee !== BigInt(-1) * (BigInt(miningReward) + totalTransactionFees)) {
      return { valid: Validity.No, reason: VerificationResultReason.INVALID_MINERS_FEE }
    }

    return { valid: Validity.Yes }
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
    blockHeader: BlockHeader<E, H, T, SE, SH, ST>,
    options: { verifyTarget?: boolean } = { verifyTarget: true },
  ): VerificationResult {
    if (blockHeader.graffiti.byteLength != 32) {
      return { valid: Validity.No, reason: VerificationResultReason.GRAFFITI }
    }

    if (this.enableVerifyTarget && options.verifyTarget && !blockHeader.verifyTarget()) {
      return { valid: Validity.No, reason: VerificationResultReason.HASH_NOT_MEET_TARGET }
    }

    if (blockHeader.timestamp.getTime() > Date.now() + ALLOWED_BLOCK_FUTURE_SECONDS * 1000) {
      return { valid: Validity.No, reason: VerificationResultReason.TOO_FAR_IN_FUTURE }
    }

    return { valid: Validity.Yes }
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
  ): Promise<{ transaction: T; serializedTransaction: ST }> {
    if (!isNewTransactionPayload<ST>(payload)) {
      return Promise.reject('Payload is not a serialized transaction')
    }
    const serde = this.strategy.transactionSerde()
    let transaction
    try {
      transaction = serde.deserialize(payload.transaction)
    } catch {
      return Promise.reject('Could not deserialize transaction')
    }
    if ((await transaction.transactionFee()) < 0) {
      return Promise.reject('Transaction has negative fees')
    }
    if (!(await transaction.verify()).valid) {
      return Promise.reject('Transaction is invalid')
    }
    return Promise.resolve({ transaction, serializedTransaction: payload.transaction })
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
  isValidAgainstPrevious(
    current: Block<E, H, T, SE, SH, ST>,
    previousHeader: BlockHeader<E, H, T, SE, SH, ST>,
  ): VerificationResult {
    const { notes, nullifiers } = current.counts()

    if (current.header.noteCommitment.size !== previousHeader.noteCommitment.size + notes) {
      return { valid: Validity.No, reason: VerificationResultReason.NOTE_COMMITMENT_SIZE }
    }

    if (
      current.header.nullifierCommitment.size !==
      previousHeader.nullifierCommitment.size + nullifiers
    ) {
      return { valid: Validity.No, reason: VerificationResultReason.NULLIFIER_COMMITMENT_SIZE }
    }

    if (
      current.header.timestamp.getTime() <
      previousHeader.timestamp.getTime() - ALLOWED_BLOCK_FUTURE_SECONDS * 1000
    ) {
      return { valid: Validity.No, reason: VerificationResultReason.BLOCK_TOO_OLD }
    }

    if (current.header.sequence !== previousHeader.sequence + BigInt(1)) {
      return { valid: Validity.No, reason: VerificationResultReason.SEQUENCE_OUT_OF_ORDER }
    }

    if (!this.isValidTarget(current.header, previousHeader)) {
      return { valid: Validity.No, reason: VerificationResultReason.INVALID_TARGET }
    }

    return { valid: Validity.Yes }
  }

  /**
   * Verify that the target of this block is correct aginst the block before it.
   */
  protected isValidTarget(
    header: BlockHeader<E, H, T, SE, SH, ST>,
    previous: BlockHeader<E, H, T, SE, SH, ST>,
  ): boolean {
    if (!this.enableVerifyTarget) return true

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
  async hasValidSpends(
    block: Block<E, H, T, SE, SH, ST>,
    tx?: IDatabaseTransaction,
  ): Promise<VerificationResult> {
    return this.chain.db.withTransaction(
      tx,
      [
        this.chain.notes.counter,
        this.chain.notes.leaves,
        this.chain.notes.nodes,
        this.chain.nullifiers.counter,
        this.chain.nullifiers.leaves,
        this.chain.nullifiers.nodes,
      ],
      'read',
      async (tx) => {
        const spendsInThisBlock = Array.from(block.spends())
        const previousSpendCount =
          block.header.nullifierCommitment.size - spendsInThisBlock.length
        for (const [index, spend] of spendsInThisBlock.entries()) {
          if (!(await this.verifySpend(spend, previousSpendCount + index, tx))) {
            return { valid: Validity.No, reason: VerificationResultReason.INVALID_SPEND }
          }
        }

        return { valid: Validity.Yes }
      },
    )
  }

  // TODO: Rename to verifyBlock but merge verifyBlock into this
  async verifyBlockAdd(
    block: Block<E, H, T, SE, SH, ST>,
    prev: BlockHeader<E, H, T, SE, SH, ST> | null
  ): Promise<VerificationResult> {
    if (block.header.sequence === GENESIS_BLOCK_SEQUENCE) {
      return { valid: Validity.Yes }
    }

    if (!prev) {
      return { valid: Validity.No, reason: VerificationResultReason.INVALID_PREV_HASH }
    }

    if (!block.header.previousBlockHash.equals(prev.hash)) {
      return { valid: Validity.No, reason: VerificationResultReason.INVALID_PREV_HASH }
    }

    return block.withTransactionReferences(async () => {
      let verification = this.isValidAgainstPrevious(block, prev)
      if (verification.valid == Validity.No) {
        return verification
      }

      verification = await this.verifyBlock(block)
      if (verification.valid == Validity.No) {
        return verification
      }

      verification = await this.hasValidSpends(block)
      if (verification.valid == Validity.No) {
        return verification
      }

      return { valid: Validity.Yes }
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
    spend: Spend<H>,
    size: number,
    tx?: IDatabaseTransaction,
  ): Promise<boolean> {
    if (await this.chain.nullifiers.contained(spend.nullifier, size, tx)) {
      return false
    }
    try {
      const realSpendRoot = await this.chain.notes.pastRoot(spend.size, tx)
      if (!this.strategy.noteHasher().hashSerde().equals(spend.commitment, realSpendRoot)) {
        return false
      }
    } catch {
      return false
    }

    return true
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
    header: BlockHeader<E, H, T, SE, SH, ST>,
    tx?: IDatabaseTransaction,
  ): Promise<{ valid: boolean; reason: VerificationResultReason | null }> {
    return this.chain.db.withTransaction(
      tx,
      [
        this.chain.notes.counter,
        this.chain.notes.leaves,
        this.chain.notes.nodes,
        this.chain.nullifiers.counter,
        this.chain.nullifiers.leaves,
        this.chain.nullifiers.nodes,
      ],
      'read',
      async (tx) => {
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
          !this.strategy
            .noteHasher()
            .hashSerde()
            .equals(pastNoteRoot, header.noteCommitment.commitment)
        ) {
          return { valid: false, reason: VerificationResultReason.NOTE_COMMITMENT }
        }

        const pastNullifierRoot = await this.chain.nullifiers.pastRoot(nullifierSize, tx)
        if (
          !this.strategy
            .nullifierHasher()
            .hashSerde()
            .equals(pastNullifierRoot, header.nullifierCommitment.commitment)
        ) {
          return { valid: false, reason: VerificationResultReason.NULLIFIER_COMMITMENT }
        }

        return { valid: true, reason: null }
      },
    )
  }
}

/**
 * Indicator of whether or not an entity is valid. Note that No maps to zero,
 * so a truthy test will work, but beware of Unknown responses
 *
 * TODO: Remove Unknown, and delete this entire enum. Unknown validity
 * is the same as not valid and therefore this should just be a bool.
 * Validness is binary, there is no tertiary state to validness.
 */
export enum Validity {
  No,
  Yes,
  Unknown,
}

export enum VerificationResultReason {
  BLOCK_TOO_OLD = 'Block timestamp is in past',
  ERROR = 'error',
  HASH_NOT_MEET_TARGET = 'hash does not meet target',
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
  INVALID_SPEND = 'Invalid spend',
  ORPHAN = 'Block is an orphan',
  DUPLICATE = 'duplicate',
}

/**
 * Indicate whether some entity is valid, and if not, provide a reason and
 * hash.
 */
export interface VerificationResult {
  valid: Validity
  reason?: VerificationResultReason
  hash?: BlockHash
}

export class IronfishVerifier extends Verifier<
  IronfishNoteEncrypted,
  WasmNoteEncryptedHash,
  IronfishTransaction,
  SerializedWasmNoteEncrypted,
  SerializedWasmNoteEncryptedHash,
  SerializedTransaction
> {}
