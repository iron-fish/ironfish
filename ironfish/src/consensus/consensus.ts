/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { TransactionVersion } from '../primitives/transaction'

export type ActivationSequence = number | 'never'

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
}

export class Consensus {
  readonly parameters: ConsensusParameters

  constructor(parameters: ConsensusParameters) {
    this.parameters = parameters
  }

  isActive(upgrade: ActivationSequence, sequence: number): boolean {
    if (upgrade === 'never') {
      return false
    }
    return Math.max(1, sequence) >= upgrade
  }

  /**
   * Returns true if the upgrade can never activate on the network
   */
  isNeverActive(upgrade: keyof ConsensusParameters): boolean {
    return this.parameters[upgrade] === 'never'
  }

  getActiveTransactionVersion(sequence: number): TransactionVersion {
    if (this.isActive(this.parameters.enableAssetOwnership, sequence)) {
      return TransactionVersion.V2
    } else {
      return TransactionVersion.V1
    }
  }
}

export class TestnetConsensus extends Consensus {
  constructor(parameters: ConsensusParameters) {
    super(parameters)
  }
}
