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
    enforceSequentialBlockTime: 1,
  }

  let consensus: Consensus

  beforeAll(() => {
    consensus = new Consensus(params)
  })

  describe('isActive', () => {
    describe('returns false when the sequence is less than the upgrade number', () => {
      const upgradeSequence = 5
      for (let sequence = 1; sequence < upgradeSequence; sequence++) {
        it(`sequence: ${sequence}`, () => {
          expect(consensus.isActive(upgradeSequence, sequence)).toBe(false)
        })
      }
    })

    describe('returns true when the sequence is greater than or equal to the upgrade number', () => {
      const upgradeSequence = 5
      for (let sequence = upgradeSequence; sequence < upgradeSequence * 2; sequence++) {
        it(`sequence: ${sequence}`, () => {
          expect(consensus.isActive(upgradeSequence, sequence)).toBe(true)
        })
      }
    })

    it('uses a minimum sequence of 1 if given a smaller sequence', () => {
      const upgradeSequence = 1
      expect(consensus.isActive(upgradeSequence, -100)).toBe(true)
      expect(consensus.isActive(upgradeSequence, -1)).toBe(true)
      expect(consensus.isActive(upgradeSequence, 0)).toBe(true)
    })
  })

  it('getActiveTransactionVersion', () => {
    expect(consensus.getActiveTransactionVersion(5)).toEqual(TransactionVersion.V1)
    expect(consensus.getActiveTransactionVersion(6)).toEqual(TransactionVersion.V1)
    expect(consensus.getActiveTransactionVersion(7)).toEqual(TransactionVersion.V2)
    expect(consensus.getActiveTransactionVersion(8)).toEqual(TransactionVersion.V2)
  })

  it('when activation flag is null', () => {
    consensus = new Consensus({
      allowedBlockFutureSeconds: 1,
      genesisSupplyInIron: 2,
      targetBlockTimeInSeconds: 3,
      targetBucketTimeInSeconds: 4,
      maxBlockSizeBytes: 5,
      minFee: 6,
      enableAssetOwnership: 'never',
    })
    expect(consensus.getActiveTransactionVersion(5)).toEqual(TransactionVersion.V1)
    expect(consensus.isActive(consensus.parameters.enableAssetOwnership, 3)).toBe(false)
  })
})
