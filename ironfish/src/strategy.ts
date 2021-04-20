/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MerkleHasher } from './merkletree'
import { NullifierHash, Nullifier } from './primitives/nullifier'
import {
  IronfishTransaction,
  SerializedTransaction,
  Transaction,
  TransactionSerde,
} from './primitives/transaction'
import { IronfishVerifier, Verifier } from './consensus/verifier'
import { Blockchain, IronfishBlockchain } from './blockchain'
import { Serde, JsonSerializable } from './serde'
import { GENESIS_SUPPLY_IN_IRON, IRON_FISH_YEAR_IN_BLOCKS } from './consensus'
import { WorkerPool } from './workerPool'
import {
  IronfishNoteEncrypted,
  SerializedWasmNoteEncrypted,
  SerializedWasmNoteEncryptedHash,
  WasmNoteEncryptedHash,
} from './primitives/noteEncrypted'
import { NoteHasher } from './merkletree/hasher'
import { NullifierHasher } from './primitives/nullifier'
import { BlockSerde } from './primitives/block'
import { hashBlockHeader, BlockHash } from './primitives/blockheader'

/**
 * Strategy to allow Blockchain to remain
 * generic across computations.
 * Methods give access to the hasher and nullifier hasher
 * and custom calculations for block hash, target,
 * and miner's fee.
 */
export interface Strategy<
  E,
  H,
  T extends Transaction<E, H>,
  SE extends JsonSerializable,
  SH extends JsonSerializable,
  ST
> {
  /**
   * Create a verifier used to validate conensus
   */
  createVerifier(chain: Blockchain<E, H, T, SE, SH, ST>): Verifier<E, H, T, SE, SH, ST>

  /**
   * Get the hasher used to calculate hashes of notes in the tree.
   */
  noteHasher(): MerkleHasher<E, H, SE, SH>

  /**
   * Get the hasher used to calculate hashes of nullifiers. Note that you
   * probably want to use a NullifierHasher here.
   */
  nullifierHasher(): MerkleHasher<Nullifier, NullifierHash, string, string>

  /**
   * Get the object that can serialize and deserialize lists of transactions.
   */
  transactionSerde(): Serde<T, ST>

  /**
   * Get the object that can serialize and deserialize blocks
   */
  readonly blockSerde: BlockSerde<E, H, T, SE, SH, ST>

  /**
   * Given the serialized bytes of a block header, return a 32-byte hash of that block.
   *
   * Note: in Ironfish, the hashing algorithm is hard-coded into the mining thread,
   * and hashBlockHeader must always return the result of miningAlgorithm.hashBlockHeader.
   *
   * Ideally we could remove this method altogether, but unit tests rely
   * on it heavily.
   */
  hashBlockHeader(header: Buffer): BlockHash

  /**
   * Create the miner's fee transaction for a given block.
   *
   * The miner's fee is a special transaction with one receipt and
   * zero spends. It's receipt value must be the total transaction fees
   * in the block plus the mining reward for the block.
   *
   * The mining reward may change over time, so we accept the block sequence
   * to calculate the mining reward from.
   *
   * @param totalTransactionFees is the sum of the transaction fees intended to go
   * in this block.
   * @param blockSequence the sequence of the block for which the miner's fee is being created
   * @param minerKey the spending key for the miner.
   */
  createMinersFee(
    totalTransactionFees: bigint,
    blockSequence: bigint,
    minerKey: string,
  ): Promise<T>

  /**
   * Calculate the mining reward for a block based on its sequence
   */
  miningReward(blockSequence: bigint): number
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
  _transactionSerde: TransactionSerde

  private _verifierClass: typeof IronfishVerifier
  private miningRewardCachedByYear: Map<number, number>
  private readonly workerPool: WorkerPool

  constructor(workerPool: WorkerPool, verifierClass: typeof IronfishVerifier | null = null) {
    this._noteHasher = new NoteHasher()
    this._nullifierHasher = new NullifierHasher()
    this._transactionSerde = new TransactionSerde(workerPool)
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
    return this._transactionSerde
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
    minerSpendKey: string,
  ): Promise<IronfishTransaction> {
    // Create a new note with value equal to the inverse of the sum of the
    // transaction fees and the mining reward
    const amount = totalTransactionFees + BigInt(this.miningReward(blockSequence))

    return this.workerPool.createMinersFee(minerSpendKey, amount, '')
  }
}
