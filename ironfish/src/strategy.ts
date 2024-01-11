/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { blake3 } from '@napi-rs/blake-hash'
import bufio from 'bufio'
import { Consensus } from './consensus'
import { Block, RawBlock } from './primitives/block'
import { BlockHash, BlockHeader, RawBlockHeader } from './primitives/blockheader'
import { Transaction } from './primitives/transaction'
import { MathUtils } from './utils'
import { WorkerPool } from './workerPool'

/**
 * Implementation of a Blockchain Strategy using zero-knowledge proofs.
 */
export class Strategy {
  readonly workerPool: WorkerPool
  readonly consensus: Consensus

  private miningRewardCachedByYear: Map<number, number>

  constructor(options: { workerPool: WorkerPool; consensus: Consensus }) {
    this.miningRewardCachedByYear = new Map<number, number>()
    this.workerPool = options.workerPool
    this.consensus = options.consensus
  }

  /**
   * Calculate the mining reward for a block based on its sequence
   *
   * See https://ironfish.network/docs/whitepaper/4_mining#include-the-miner-reward-based-on-coin-emission-schedule
   *
   * Annual coin issuance from mining goes down every year. Year is defined here by the
   * number of blocks
   *
   * Given the genesis block supply (genesisSupplyInIron) the formula to calculate
   * reward per block is:
   * (genesisSupply / 4) * e ^(-.05 * yearsAfterLaunch)
   * Where e is the natural number e (Euler's number), and -.05 is a decay function constant
   *
   * @param sequence Block sequence
   * @returns mining reward (in ORE) per block given the block sequence
   */
  miningReward(sequence: number): number {
    const ironFishYearInBlocks =
      (365 * 24 * 60 * 60) / this.consensus.parameters.targetBlockTimeInSeconds
    const yearsAfterLaunch = Math.floor(Number(sequence) / ironFishYearInBlocks)

    let reward = this.miningRewardCachedByYear.get(yearsAfterLaunch)
    if (reward) {
      return reward
    }

    const annualReward =
      (this.consensus.parameters.genesisSupplyInIron / 4) * Math.E ** (-0.05 * yearsAfterLaunch)

    reward = this.convertIronToOre(
      MathUtils.roundBy(annualReward / ironFishYearInBlocks, 0.125),
    )

    this.miningRewardCachedByYear.set(yearsAfterLaunch, reward)

    return reward
  }

  convertIronToOre(iron: number): number {
    return Math.round(iron * 10 ** 8)
  }

  /**
   * Create the miner's fee transaction for a given block.
   *
   * The miner's fee is a special transaction with one output and
   * zero spends. Its output value must be the total transaction fees
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
  async createMinersFee(
    totalTransactionFees: bigint,
    blockSequence: number,
    minerSpendKey: string,
  ): Promise<Transaction> {
    // Create a new note with value equal to the inverse of the sum of the
    // transaction fees and the mining reward
    const amount = totalTransactionFees + BigInt(this.miningReward(blockSequence))

    const transactionVersion = this.consensus.getActiveTransactionVersion(blockSequence)

    return this.workerPool.createMinersFee(minerSpendKey, amount, '', transactionVersion)
  }

  hashHeader(header: RawBlockHeader): BlockHash {
    const serialized = serializeHeaderBlake3(header)
    return blake3(serialized)
  }

  newBlockHeader(raw: RawBlockHeader, noteSize?: number | null, work?: bigint): BlockHeader {
    const hash = this.hashHeader(raw)
    return new BlockHeader(raw, hash, noteSize, work)
  }

  newBlock(raw: RawBlock, noteSize?: number | null, work?: bigint): Block {
    const header = this.newBlockHeader(raw.header, noteSize, work)
    return new Block(header, raw.transactions)
  }
}

function serializeHeaderBlake3(header: RawBlockHeader): Buffer {
  const bw = bufio.write(180)
  bw.writeBigU64BE(header.randomness)
  bw.writeU32(header.sequence)
  bw.writeHash(header.previousBlockHash)
  bw.writeHash(header.noteCommitment)
  bw.writeHash(header.transactionCommitment)
  bw.writeBigU256BE(header.target.asBigInt())
  bw.writeU64(header.timestamp.getTime())
  bw.writeBytes(header.graffiti)

  return bw.render()
}
