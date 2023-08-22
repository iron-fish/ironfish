/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { TransactionVersion } from '../primitives/transaction'
import { Consensus, ConsensusParameters } from './consensus'

describe('Consensus', () => {
  const params: ConsensusParameters = {
    allowedBlockFutureSeconds: 1,
    genesisSupplyInIron: 2,
    targetBlockTimeInSeconds: 3,
    targetBucketTimeInSeconds: 4,
    maxBlockSizeBytes: 5,
    minFee: 6,
    enableAssetOwnership: 7,
  }

  let consensus: Consensus

  beforeAll(() => {
    consensus = new Consensus(params)
  })

  it('isActive', () => {
    expect(consensus.isActive(params.enableAssetOwnership, 5)).toEqual(false)
    expect(consensus.isActive(params.enableAssetOwnership, 6)).toEqual(false)
    expect(consensus.isActive(params.enableAssetOwnership, 7)).toEqual(true)
    expect(consensus.isActive(params.enableAssetOwnership, 8)).toEqual(true)
  })

  it('getActiveTransactionVersion', () => {
    expect(consensus.getActiveTransactionVersion(5)).toEqual(TransactionVersion.V1)
    expect(consensus.getActiveTransactionVersion(6)).toEqual(TransactionVersion.V1)
    expect(consensus.getActiveTransactionVersion(7)).toEqual(TransactionVersion.V2)
    expect(consensus.getActiveTransactionVersion(8)).toEqual(TransactionVersion.V2)
  })
})
