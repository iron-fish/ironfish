/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

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
   * The oldest the tip should be before we consider the chain synced
   */
  maxSyncedAgeBlocks: number

  /**
   * The time range when difficulty and target not change
   */
  targetBucketTimeInSeconds: number

  /**
   * Max block size
   */
  maxBlockSizeBytes: number
}

export class Consensus {
  readonly parameters: ConsensusParameters

  /**
   * Before upgrade V2 we didn't enforce max block size.
   * At this block we check that the block size doesn't exceed maxBlockSizeBytes.
   *
   * TODO: remove this sequence check before mainnet
   */
  V2_MAX_BLOCK_SIZE = 0

  /**
   * All mined blocks give 0 mining reward
   */
  V3_DISABLE_MINING_REWARD = Number.MAX_SAFE_INTEGER

  constructor(parameters: ConsensusParameters) {
    this.parameters = parameters
  }

  isActive(upgrade: number, sequence: number): boolean {
    return sequence >= upgrade
  }
}

export class TestnetConsensus extends Consensus {
  constructor(parameters: ConsensusParameters) {
    super(parameters)
    this.V2_MAX_BLOCK_SIZE = 255000
    this.V3_DISABLE_MINING_REWARD = 279900
  }
}
