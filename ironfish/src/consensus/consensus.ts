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
}

export class Consensus {
  readonly parameters: ConsensusParameters

  constructor(parameters: ConsensusParameters) {
    this.parameters = parameters
  }

  isActive(upgrade: number, sequence: number): boolean {
    return Math.max(1, sequence) >= upgrade
  }
}

export class TestnetConsensus extends Consensus {
  constructor(parameters: ConsensusParameters) {
    super(parameters)
  }
}
