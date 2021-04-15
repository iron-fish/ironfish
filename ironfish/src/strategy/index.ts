/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  generateNewPublicAddress,
  WasmNote,
  WasmNoteEncrypted,
  WasmTransactionPosted,
} from 'ironfish-wasm-nodejs'
import { BlockSyncer } from '../blockSyncer'
import {
  Block,
  BlockHash,
  BlockSerde,
  BlockHeader,
  NullifierHasher,
  SerializedBlock,
  Blockchain,
} from '../blockchain'
import { MerkleHasher, Witness } from '../merkletree'
import { Transaction, Spend } from './transaction'
import Serde from '../serde'
import { MiningDirector } from '../mining'
import hashBlockHeader from '../mining/miningAlgorithm'
import { AsyncTransactionWorkerPool } from './asyncTransactionWorkerPool'
import { MemPool } from '../memPool'
import {
  Validity,
  VerificationResult,
  Verifier,
  VerificationResultReason,
} from '../consensus/verifier'

export { Transaction, Spend } from './transaction'
export { default as Strategy } from './strategy'
import Strategy from './strategy'
import { WorkerPool } from '../workerPool'
/**
 * Implementation of the IronFish strategy that calls into sapling via Wasm
 * to encode notes in zero-knowledge proofs.
 */

/**
 * Serialized version of an encrypted note.
 */
export type SerializedWasmNoteEncrypted = Buffer

/**
 * An encrypted note's hash.
 */
export type WasmNoteEncryptedHash = Buffer

/**
 * Serialized version of an encrypted note's hash.
 */
export type SerializedWasmNoteEncryptedHash = Buffer

export const GENESIS_SUPPLY_IN_IRON = 42000000

export const IRON_FISH_YEAR_IN_BLOCKS = 2100000

/**
 * Serde implementation to convert an encrypted note to its serialized form and back.
 */
class WasmNoteEncryptedSerde
  implements Serde<IronfishNoteEncrypted, SerializedWasmNoteEncrypted> {
  equals(note1: IronfishNoteEncrypted, note2: IronfishNoteEncrypted): boolean {
    return note1.serialize().equals(note2.serialize())
  }

  serialize(note: IronfishNoteEncrypted): SerializedWasmNoteEncrypted {
    return note.serialize()
  }

  deserialize(serializedNote: SerializedWasmNoteEncrypted): IronfishNoteEncrypted {
    return new IronfishNoteEncrypted(serializedNote)
  }
}

/**
 * Serde implementation to convert an encrypted note's hash to its serialized form and back.
 */
class WasmNoteEncryptedHashSerde
  implements Serde<WasmNoteEncryptedHash, SerializedWasmNoteEncryptedHash> {
  equals(hash1: WasmNoteEncryptedHash, hash2: WasmNoteEncryptedHash): boolean {
    return hash1.equals(hash2)
  }
  serialize(note: WasmNoteEncryptedHash): SerializedWasmNoteEncryptedHash {
    return note
  }
  deserialize(serializedNote: SerializedWasmNoteEncryptedHash): WasmNoteEncryptedHash {
    return serializedNote
  }
}

/**
 * Hasher implementation for notes to satisfy the MerkleTree requirements.
 */
export class NoteHasher
  implements
    MerkleHasher<
      IronfishNoteEncrypted,
      WasmNoteEncryptedHash,
      SerializedWasmNoteEncrypted,
      SerializedWasmNoteEncryptedHash
    > {
  _merkleNoteSerde: WasmNoteEncryptedSerde
  _merkleNoteHashSerde: WasmNoteEncryptedHashSerde
  constructor() {
    this._merkleNoteSerde = new WasmNoteEncryptedSerde()
    this._merkleNoteHashSerde = new WasmNoteEncryptedHashSerde()
  }

  elementSerde(): Serde<IronfishNoteEncrypted, SerializedWasmNoteEncrypted> {
    return this._merkleNoteSerde
  }

  hashSerde(): Serde<WasmNoteEncryptedHash, SerializedWasmNoteEncryptedHash> {
    return this._merkleNoteHashSerde
  }

  merkleHash(note: IronfishNoteEncrypted): Buffer {
    return note.merkleHash()
  }

  combineHash(
    depth: number,
    left: WasmNoteEncryptedHash,
    right: WasmNoteEncryptedHash,
  ): WasmNoteEncryptedHash {
    return Buffer.from(WasmNoteEncrypted.combineHash(depth, left, right))
  }
}

export type TransactionHash = Buffer

export class IronfishNote {
  private readonly wasmNoteSerialized: Buffer
  private wasmNote: WasmNote | null = null
  private referenceCount = 0

  constructor(wasmNoteSerialized: Buffer) {
    this.wasmNoteSerialized = wasmNoteSerialized
  }

  serialize(): Buffer {
    return this.wasmNoteSerialized
  }

  takeReference(): WasmNote {
    this.referenceCount++
    if (this.wasmNote === null) {
      this.wasmNote = WasmNote.deserialize(this.wasmNoteSerialized)
    }
    return this.wasmNote
  }

  returnReference(): void {
    this.referenceCount--
    if (this.referenceCount <= 0) {
      this.referenceCount = 0
      this.wasmNote?.free()
      this.wasmNote = null
    }
  }

  value(): BigInt {
    const value = this.takeReference().value
    this.returnReference()
    return value
  }

  memo(): string {
    const memo = this.takeReference().memo
    this.returnReference()
    return memo
  }

  nullifier(ownerPrivateKey: string, position: BigInt): Buffer {
    const buf = Buffer.from(this.takeReference().nullifier(ownerPrivateKey, position))
    this.returnReference()
    return buf
  }
}

export class IronfishNoteEncrypted {
  private readonly wasmNoteEncryptedSerialized: Buffer
  private wasmNoteEncrypted: WasmNoteEncrypted | null = null
  private referenceCount = 0

  constructor(wasmNoteEncryptedSerialized: Buffer) {
    this.wasmNoteEncryptedSerialized = wasmNoteEncryptedSerialized
  }

  serialize(): Buffer {
    return this.wasmNoteEncryptedSerialized
  }

  takeReference(): WasmNoteEncrypted {
    this.referenceCount++
    if (this.wasmNoteEncrypted === null) {
      this.wasmNoteEncrypted = WasmNoteEncrypted.deserialize(this.wasmNoteEncryptedSerialized)
    }
    return this.wasmNoteEncrypted
  }

  returnReference(): void {
    this.referenceCount--
    if (this.referenceCount <= 0) {
      this.referenceCount = 0
      this.wasmNoteEncrypted?.free()
      this.wasmNoteEncrypted = null
    }
  }

  decryptNoteForOwner(ownerHexKey: string): IronfishNote | undefined {
    const note = this.takeReference().decryptNoteForOwner(ownerHexKey)
    this.returnReference()
    if (note) {
      const serializedNote = note.serialize()
      note.free()
      return new IronfishNote(Buffer.from(serializedNote))
    }
  }

  decryptNoteForSpender(spenderHexKey: string): IronfishNote | undefined {
    const note = this.takeReference().decryptNoteForSpender(spenderHexKey)
    this.returnReference()
    if (note) {
      const serializedNote = note.serialize()
      note.free()
      return new IronfishNote(Buffer.from(serializedNote))
    }
  }

  merkleHash(): Buffer {
    const note = this.takeReference().merkleHash()
    this.returnReference()
    return Buffer.from(note)
  }
}

/**
 * Wraps a Wasm transaction to provide a convenient interface.
 *
 * Transactions come from a client looking to spend. They are stored on blocks
 * in the transaction list, and one is also used to hold the miner's fee for
 * a given transaction.
 */
export class IronfishTransaction
  implements Transaction<IronfishNoteEncrypted, WasmNoteEncryptedHash> {
  private readonly wasmTransactionPostedSerialized: Buffer
  private readonly workerPool: WorkerPool

  private wasmTransactionPosted: WasmTransactionPosted | null = null
  private referenceCount = 0

  constructor(wasmTransactionPostedSerialized: Buffer, workerPool: WorkerPool) {
    this.wasmTransactionPostedSerialized = wasmTransactionPostedSerialized
    this.workerPool = workerPool
  }

  serialize(): Buffer {
    return this.wasmTransactionPostedSerialized
  }

  takeReference(): WasmTransactionPosted {
    this.referenceCount++
    if (this.wasmTransactionPosted === null) {
      this.wasmTransactionPosted = WasmTransactionPosted.deserialize(
        this.wasmTransactionPostedSerialized,
      )
    }
    return this.wasmTransactionPosted
  }

  returnReference(): void {
    this.referenceCount--
    if (this.referenceCount <= 0) {
      this.referenceCount = 0
      this.wasmTransactionPosted?.free()
      this.wasmTransactionPosted = null
    }
  }

  withReference<R>(callback: (transaction: WasmTransactionPosted) => R): R {
    const transaction = this.takeReference()
    try {
      return callback(transaction)
    } finally {
      this.returnReference()
    }
  }

  async verify(): Promise<VerificationResult> {
    const result = await this.workerPool.verify(this)
    return result === true
      ? { valid: Validity.Yes }
      : { valid: Validity.No, reason: VerificationResultReason.ERROR }
  }

  notesLength(): number {
    return this.withReference((t) => t.notesLength)
  }

  getNote(index: number): IronfishNoteEncrypted {
    return this.withReference((t) => {
      // Get the note
      const serializedNote = Buffer.from(t.getNote(index))

      // Convert it to an IronfishNoteEncrypted
      return new IronfishNoteEncrypted(serializedNote)
    })
  }

  *notes(): Iterable<IronfishNoteEncrypted> {
    const notesLength = this.notesLength()

    for (let i = 0; i < notesLength; i++) {
      yield this.getNote(i)
    }
  }

  spendsLength(): number {
    return this.withReference((t) => t.spendsLength)
  }

  *spends(): Iterable<Spend<WasmNoteEncryptedHash>> {
    const spendsLength = this.spendsLength()
    for (let i = 0; i < spendsLength; i++) {
      yield this.withReference((t) => {
        const wasmSpend = t.getSpend(i)
        const spend: Spend<WasmNoteEncryptedHash> = {
          size: wasmSpend.treeSize,
          nullifier: Buffer.from(wasmSpend.nullifier),
          commitment: Buffer.from(wasmSpend.rootHash),
        }
        wasmSpend.free()
        return spend
      })
    }
  }

  transactionFee(): Promise<bigint> {
    return this.workerPool.transactionFee(this)
  }

  transactionSignature(): Buffer {
    return this.withReference((t) => Buffer.from(t.transactionSignature))
  }

  transactionHash(): TransactionHash {
    return this.withReference((t) => Buffer.from(t.transactionHash))
  }
}

/**
 * Serialized version of the Transaction wrapper.
 */
export type SerializedTransaction = Buffer

export type SerializedIronfishBlock = SerializedBlock<
  SerializedWasmNoteEncryptedHash,
  SerializedTransaction
>

/**
 * Serializer and equality checker for Transaction wrappers.
 */
export class TransactionSerde implements Serde<IronfishTransaction, SerializedTransaction> {
  constructor(private readonly workerPool: WorkerPool) {}

  equals(): boolean {
    throw new Error(`Not implemented`)
  }

  serialize(transaction: IronfishTransaction): SerializedTransaction {
    return transaction.serialize()
  }

  deserialize(data: SerializedTransaction): IronfishTransaction {
    return new IronfishTransaction(data, this.workerPool)
  }
}

/**
 * Implementation of a Blockchain Strategy using the Wasm zero-knowledge proofs.
 */
export class IronfishStrategy
  implements
    Strategy<
      IronfishNoteEncrypted,
      WasmNoteEncryptedHash,
      IronfishTransaction,
      SerializedWasmNoteEncrypted,
      SerializedWasmNoteEncryptedHash,
      SerializedTransaction
    > {
  _noteHasher: NoteHasher

  _nullifierHasher: NullifierHasher

  _blockSerde: BlockSerde<
    IronfishNoteEncrypted,
    WasmNoteEncryptedHash,
    IronfishTransaction,
    SerializedWasmNoteEncrypted,
    SerializedWasmNoteEncryptedHash,
    SerializedTransaction
  >
  private _verifierClass: typeof IronfishVerifier
  private miningRewardCachedByYear: Map<number, number>
  private readonly workerPool: WorkerPool

  constructor(workerPool: WorkerPool, verifierClass: typeof IronfishVerifier | null = null) {
    this._noteHasher = new NoteHasher()
    this._nullifierHasher = new NullifierHasher()
    this._blockSerde = new BlockSerde(this)
    this._verifierClass = verifierClass || Verifier
    this.miningRewardCachedByYear = new Map<number, number>()
    this.workerPool = workerPool
  }

  noteHasher(): NoteHasher {
    return this._noteHasher
  }

  nullifierHasher(): NullifierHasher {
    return this._nullifierHasher
  }

  transactionSerde(): TransactionSerde {
    return new TransactionSerde(this.workerPool)
  }

  get blockSerde(): BlockSerde<
    IronfishNoteEncrypted,
    WasmNoteEncryptedHash,
    IronfishTransaction,
    SerializedWasmNoteEncrypted,
    SerializedWasmNoteEncryptedHash,
    SerializedTransaction
  > {
    return this._blockSerde
  }

  hashBlockHeader(serializedHeader: Buffer): BlockHash {
    return hashBlockHeader(serializedHeader)
  }

  /**
   * See https://ironfish.network/docs/whitepaper/4_mining#include-the-miner-reward-based-on-coin-emission-schedule
   *
   * Annual coin issuance from mining goes down every year. Year is defined here by the
   * number of blocks (IRON_FISH_YEAR_IN_BLOCKS)
   *
   * Given the genesis block supply (GENESIS_SUPPLY_IN_IRON) the formula to calculate
   * reward per block is:
   * (genesisSupply / 4) * e ^(-.05 * yearsAfterLaunch)
   * Where e is the natural number e (Euler's number), and -.05 is a decay function constant
   *
   * @param sequence Block sequence
   * @returns mining reward (in ORE) per block given the block sequence
   */
  miningReward(sequence: bigint): number {
    const yearsAfterLaunch = Math.floor(Number(sequence) / IRON_FISH_YEAR_IN_BLOCKS)
    let reward = this.miningRewardCachedByYear.get(yearsAfterLaunch)
    if (reward) {
      return reward
    }

    const annualReward = (GENESIS_SUPPLY_IN_IRON / 4) * Math.E ** (-0.05 * yearsAfterLaunch)
    reward = this.convertIronToOre(annualReward / IRON_FISH_YEAR_IN_BLOCKS)
    this.miningRewardCachedByYear.set(yearsAfterLaunch, reward)

    return reward
  }

  convertIronToOre(iron: number): number {
    return Math.round(iron * 10 ** 8)
  }

  createVerifier(chain: IronfishBlockchain): IronfishVerifier {
    return new this._verifierClass(chain)
  }

  async createMinersFee(
    totalTransactionFees: bigint,
    blockSequence: bigint,
    minerKey: string,
  ): Promise<IronfishTransaction> {
    const transaction = AsyncTransactionWorkerPool.createTransaction()

    // Generate a public address from the miner's spending key
    const owner = generateNewPublicAddress(minerKey).public_address

    // Create a new note with value equal to the inverse of the sum of the
    // transaction fees and the mining reward
    const amount = totalTransactionFees + BigInt(this.miningReward(blockSequence))
    const minerNote = new WasmNote(owner, amount, '')
    const serializedNote = Buffer.from(minerNote.serialize())
    minerNote.free()

    await transaction.receive(minerKey, new IronfishNote(serializedNote))

    return new IronfishTransaction(
      Buffer.from((await transaction.postMinersFee(this.workerPool)).serialize()),
      this.workerPool,
    )
  }
}

export type IronfishBlock = Block<
  IronfishNoteEncrypted,
  WasmNoteEncryptedHash,
  IronfishTransaction,
  SerializedWasmNoteEncrypted,
  SerializedWasmNoteEncryptedHash,
  SerializedTransaction
>

export type IronfishBlockHeader = BlockHeader<
  IronfishNoteEncrypted,
  WasmNoteEncryptedHash,
  IronfishTransaction,
  SerializedWasmNoteEncrypted,
  SerializedWasmNoteEncryptedHash,
  SerializedTransaction
>

export type IronfishBlockchain = Blockchain<
  IronfishNoteEncrypted,
  WasmNoteEncryptedHash,
  IronfishTransaction,
  SerializedWasmNoteEncrypted,
  SerializedWasmNoteEncryptedHash,
  SerializedTransaction
>

export type IronfishMemPool = MemPool<
  IronfishNoteEncrypted,
  WasmNoteEncryptedHash,
  IronfishTransaction,
  SerializedWasmNoteEncrypted,
  SerializedWasmNoteEncryptedHash,
  SerializedTransaction
>

export class IronfishVerifier extends Verifier<
  IronfishNoteEncrypted,
  WasmNoteEncryptedHash,
  IronfishTransaction,
  SerializedWasmNoteEncrypted,
  SerializedWasmNoteEncryptedHash,
  SerializedTransaction
> {}

export type IronfishWitness = Witness<
  IronfishNoteEncrypted,
  WasmNoteEncryptedHash,
  SerializedWasmNoteEncrypted,
  SerializedWasmNoteEncryptedHash
>

export type IronfishMiningDirector = MiningDirector<
  IronfishNoteEncrypted,
  WasmNoteEncryptedHash,
  IronfishTransaction,
  SerializedWasmNoteEncrypted,
  SerializedWasmNoteEncryptedHash,
  SerializedTransaction
>

export type IronfishBlockSyncer = BlockSyncer<
  IronfishNoteEncrypted,
  WasmNoteEncryptedHash,
  IronfishTransaction,
  SerializedWasmNoteEncrypted,
  SerializedWasmNoteEncryptedHash,
  SerializedTransaction
>
