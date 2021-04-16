/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BlockSyncer } from '../../blockSyncer'
import { ConcatHasher } from '../../merkletree'
import { MemPool } from '../../memPool'
import { NullifierHasher } from '../../blockchain/nullifiers'
import { TestVerifier } from './verifier'
import Blockchain, { Block, BlockSerde } from '../../blockchain'
import BlockHeader, { BlockHash } from '../../blockchain/blockheader'
import { Strategy, Transaction, Spend } from '../../strategy'
import { Validity, VerificationResult, VerificationResultReason } from '../../consensus'
import { StringUtils } from '../../utils'
import Serde, { BufferSerde, IJSON } from '../../serde'

export type TestBlockchain = Blockchain<
  string,
  string,
  TestTransaction,
  string,
  string,
  SerializedTestTransaction
>

export type TestMemPool = MemPool<
  string,
  string,
  TestTransaction,
  string,
  string,
  SerializedTestTransaction
>

export type TestBlockSyncer = BlockSyncer<
  string,
  string,
  TestTransaction,
  string,
  string,
  SerializedTestTransaction
>

export type TestBlockHeader = BlockHeader<
  string,
  string,
  TestTransaction,
  string,
  string,
  SerializedTestTransaction
>

export type TestBlock = Block<
  string,
  string,
  TestTransaction,
  string,
  string,
  SerializedTestTransaction
>

export type TestSerializedSpend<H> = Omit<Spend<H>, 'nullifier'> & { nullifier: string }

export type SerializedTestTransaction<H = string> = {
  elements: string[]
  spends: TestSerializedSpend<H>[]
  totalFees: string
  isValid: boolean
}

/**
 * Very basic strategy for testing blockchain code. Models notes and hashes
 * as concatenated strings, and uses dumb calculations for hashing and
 * target calculations
 */
export class TestStrategy
  implements
    Strategy<string, string, TestTransaction, string, string, SerializedTestTransaction> {
  _noteHasher: ConcatHasher
  _nullifierHasher: NullifierHasher

  _blockSerde: BlockSerde<
    string,
    string,
    TestTransaction<string>,
    string,
    string,
    SerializedTestTransaction<string>
  >

  constructor(noteHasher = new ConcatHasher()) {
    this._noteHasher = noteHasher
    this._nullifierHasher = new NullifierHasher()
    this._blockSerde = new BlockSerde(this)
  }

  createVerifier(chain: TestBlockchain): TestVerifier {
    return new TestVerifier(chain)
  }

  noteHasher(): ConcatHasher {
    return this._noteHasher
  }

  nullifierHasher(): NullifierHasher {
    return this._nullifierHasher
  }

  transactionSerde(): TestTransactionSerde {
    return new TestTransactionSerde()
  }

  get blockSerde(): BlockSerde<
    string,
    string,
    TestTransaction<string>,
    string,
    string,
    SerializedTestTransaction<string>
  > {
    return this._blockSerde
  }

  /**
   * Generate a hash from the block's sequence.
   */
  hashBlockHeader(serializedHeader: Buffer): BlockHash {
    const headerWithoutRandomness = Buffer.from(serializedHeader.slice(8))
    const header = JSON.parse(headerWithoutRandomness.toString()) as Record<string, unknown>

    const sequence = BigInt(header['sequence'])
    const bigIntArray = BigInt64Array.from([sequence])
    const byteArray = Buffer.from(bigIntArray.buffer)
    const result = Buffer.alloc(32)
    result.set(byteArray)
    return result
  }

  createMinersFee(
    totalTransactionFees: bigint,
    blockSequence: bigint,
    _minerKey: string,
  ): Promise<TestTransaction> {
    const miningReward = this.miningReward(blockSequence)
    return Promise.resolve(
      new TestTransaction(
        true,
        [`miners note ${totalTransactionFees + BigInt(miningReward)}`],
        BigInt(-1) * (totalTransactionFees + BigInt(miningReward)),
        [],
      ),
    )
  }

  miningReward(_blockSequence: bigint): number {
    return 10
  }
}

export class TestTransaction<H = string> implements Transaction<string, H> {
  isValid: boolean
  elements: string[]
  _spends: Spend<H>[]
  totalFees: bigint

  constructor(
    isValid = true,
    elements: string[] = [],
    totalFees: number | bigint = 0,
    spends: Spend<H>[] = [],
  ) {
    this.elements = elements
    this._spends = spends
    this.totalFees = BigInt(totalFees)
    this.isValid = isValid
  }

  verify(): Promise<VerificationResult> {
    return Promise.resolve({
      valid: this.isValid ? Validity.Yes : Validity.No,
      reason: this.isValid ? undefined : VerificationResultReason.INVALID_TRANSACTION_PROOF,
    })
  }

  takeReference(): boolean {
    return true
  }

  returnReference(): void {
    return
  }

  withReference<R>(callback: (transaction: TestTransaction<H>) => R): R {
    return callback(this)
  }

  notesLength(): number {
    return this.elements.length
  }

  *notes(): Iterable<string> {
    yield* this.elements
  }

  spendsLength(): number {
    return this._spends.length
  }

  *spends(): Iterable<Spend<H>> {
    yield* this._spends
  }

  transactionFee(): Promise<bigint> {
    return Promise.resolve(this.totalFees)
  }

  transactionSignature(): Buffer {
    return Buffer.from('sig')
  }

  transactionHash(): Buffer {
    return StringUtils.hash(
      JSON.stringify(this.elements) + String(this.totalFees) + JSON.stringify(this._spends),
    )
  }
}

export class TestTransactionSerde implements Serde<TestTransaction, SerializedTestTransaction> {
  equals(transactions1: TestTransaction, transactions2: TestTransaction): boolean {
    return (
      IJSON.stringify(this.serialize(transactions1)) ===
      IJSON.stringify(this.serialize(transactions2))
    )
  }

  serialize(transaction: TestTransaction): SerializedTestTransaction {
    const nullifierSerde = new BufferSerde(32)

    const spends = transaction._spends.map((t) => {
      return { ...t, nullifier: nullifierSerde.serialize(t.nullifier) }
    })
    return {
      elements: transaction.elements,
      spends,
      totalFees: transaction.totalFees.toString(),
      isValid: transaction.isValid,
    }
  }

  deserialize(data: SerializedTestTransaction): TestTransaction {
    const nullifierSerde = new BufferSerde(32)
    const spends: TestTransaction['_spends'] = data.spends.map((s) => {
      return {
        commitment: s.commitment,
        size: s.size,
        nullifier: nullifierSerde.deserialize(s.nullifier),
      }
    })
    return new TestTransaction(
      data.isValid,
      data.elements.map(String),
      BigInt(data.totalFees),
      spends,
    )
  }
}
