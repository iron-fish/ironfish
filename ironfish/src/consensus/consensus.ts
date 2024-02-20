/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { TransactionVersion } from '../primitives/transaction'

export type ActivationSequence = number | null
export type Checkpoint = { sequence: number; hash: string }

export type ConsensusParameters = {
  /**
   * When adding a block, the block can be this amount of seconds into the future
   * without rejecting it
   */
  allowedBlockFutureSeconds: number

  /**
   * The amount of coins in the genesis block
   */
  genesisSupplyInIron: number

  /**
   * The average time that all blocks should be mined
   */
  targetBlockTimeInSeconds: number

  /**
   * The time range when difficulty and target not change
   */
  targetBucketTimeInSeconds: number

  /**
   * Max block size
   */
  maxBlockSizeBytes: number

  /**
   * The minimum fee that a transaction must have to be accepted
   */
  minFee: number

  /**
   * The block height that enables the use of V2 transactions instead of V1
   */
  enableAssetOwnership: ActivationSequence

  /**
   * Before upgrade we have block timestamp smaller than previous block. After this
   * block we enforce the block timestamps in the sequential order as the block sequences.
   */
  enforceSequentialBlockTime: ActivationSequence

  /**
   * Sequence at which to start mining and validating blocks with the FishHash algorithm
   * instead Blake3. This sequence also modifies the block header serialization to move graffiti
   * to the beginning of the block header before mining.
   */
  enableFishHash: ActivationSequence

  /**
   * Sequence at which to use an increased max bucket in the target calculation,
   * allowing for a greater per-block downward shift.
   */
  enableIncreasedDifficultyChange: ActivationSequence

  /**
   * Mapping of block height to the hash of the block at that height. Once a node has added this block to
   * its main chain, it will not be disconnected from the main chain.
   */
  checkpoints: Checkpoint[]
}

export class Consensus {
  readonly parameters: ConsensusParameters
  readonly checkpoints: Map<number, Buffer>

  constructor(parameters: ConsensusParameters) {
    this.parameters = parameters
    this.checkpoints = new Map<number, Buffer>()
    for (const checkpoint of this.parameters.checkpoints) {
      this.checkpoints.set(checkpoint.sequence, Buffer.from(checkpoint.hash, 'hex'))
    }
  }

  isActive(upgrade: keyof ConsensusParameters, sequence: number): boolean {
    const upgradeSequence = this.parameters[upgrade]
    if (upgradeSequence === null || typeof upgradeSequence !== 'number') {
      return false
    }
    return Math.max(1, sequence) >= upgradeSequence
  }

  /**
   * Returns true if the upgrade can never activate on the network
   */
  isNeverActive(upgrade: keyof ConsensusParameters): boolean {
    return this.parameters[upgrade] === null
  }

  getActiveTransactionVersion(sequence: number): TransactionVersion {
    if (this.isActive('enableAssetOwnership', sequence)) {
      return TransactionVersion.V2
    } else {
      return TransactionVersion.V1
    }
  }

  getDifficultyBucketMax(sequence: number): number {
    if (this.isActive('enableIncreasedDifficultyChange', sequence)) {
      return 200
    } else {
      return 99
    }
  }
}
