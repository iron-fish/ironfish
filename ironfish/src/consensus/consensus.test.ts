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
    enforceSequentialBlockTime: 8,
    enableFishHash: 9,
    enableIncreasedDifficultyChange: 10,
    checkpoints: [],
  }

  const consensus = new Consensus(params)

  const consensusWithInactives = new Consensus({
    ...params,
    enableAssetOwnership: null,
    enforceSequentialBlockTime: null,
    enableFishHash: null,
    enableIncreasedDifficultyChange: null,
  })

  describe('isActive', () => {
    it('returns false when the sequence is less than the upgrade number', () => {
      expect(consensus.isActive('genesisSupplyInIron', 1)).toBe(false)
      expect(consensus.isActive('targetBlockTimeInSeconds', 2)).toBe(false)
      expect(consensus.isActive('targetBucketTimeInSeconds', 3)).toBe(false)
      expect(consensus.isActive('maxBlockSizeBytes', 4)).toBe(false)
      expect(consensus.isActive('minFee', 5)).toBe(false)
      expect(consensus.isActive('enableAssetOwnership', 6)).toBe(false)
      expect(consensus.isActive('enforceSequentialBlockTime', 7)).toBe(false)
      expect(consensus.isActive('enableFishHash', 8)).toBe(false)
      expect(consensus.isActive('enableIncreasedDifficultyChange', 9)).toBe(false)
    })

    it('returns true when the sequence is equal to the upgrade number', () => {
      expect(consensus.isActive('genesisSupplyInIron', 2)).toBe(true)
      expect(consensus.isActive('targetBlockTimeInSeconds', 3)).toBe(true)
      expect(consensus.isActive('targetBucketTimeInSeconds', 4)).toBe(true)
      expect(consensus.isActive('maxBlockSizeBytes', 5)).toBe(true)
      expect(consensus.isActive('minFee', 6)).toBe(true)
      expect(consensus.isActive('enableAssetOwnership', 7)).toBe(true)
      expect(consensus.isActive('enforceSequentialBlockTime', 8)).toBe(true)
      expect(consensus.isActive('enableFishHash', 9)).toBe(true)
      expect(consensus.isActive('enableIncreasedDifficultyChange', 10)).toBe(true)
    })

    it('returns true when the sequence is greater than the upgrade number', () => {
      expect(consensus.isActive('genesisSupplyInIron', 3)).toBe(true)
      expect(consensus.isActive('targetBlockTimeInSeconds', 4)).toBe(true)
      expect(consensus.isActive('targetBucketTimeInSeconds', 5)).toBe(true)
      expect(consensus.isActive('maxBlockSizeBytes', 6)).toBe(true)
      expect(consensus.isActive('minFee', 7)).toBe(true)
      expect(consensus.isActive('enableAssetOwnership', 8)).toBe(true)
      expect(consensus.isActive('enforceSequentialBlockTime', 9)).toBe(true)
      expect(consensus.isActive('enableFishHash', 10)).toBe(true)
      expect(consensus.isActive('enableIncreasedDifficultyChange', 11)).toBe(true)
    })

    it('uses a minimum sequence of 1 if given a smaller sequence', () => {
      expect(consensus.isActive('allowedBlockFutureSeconds', -100)).toBe(true)
      expect(consensus.isActive('allowedBlockFutureSeconds', -1)).toBe(true)
      expect(consensus.isActive('allowedBlockFutureSeconds', 0)).toBe(true)
    })

    it('returns false if flag activation is never', () => {
      expect(consensusWithInactives.isActive('enableAssetOwnership', 3)).toBe(false)
      expect(consensusWithInactives.isActive('enforceSequentialBlockTime', 3)).toBe(false)
      expect(consensusWithInactives.isActive('enableFishHash', 3)).toBe(false)
      expect(consensusWithInactives.isActive('enableIncreasedDifficultyChange', 3)).toBe(false)
    })
  })

  describe('isNeverActive', () => {
    it('returns true if flag activation is never', () => {
      expect(consensusWithInactives.isNeverActive('enableAssetOwnership')).toBe(true)
      expect(consensusWithInactives.isNeverActive('enforceSequentialBlockTime')).toBe(true)
      expect(consensusWithInactives.isNeverActive('enableFishHash')).toBe(true)
      expect(consensusWithInactives.isNeverActive('enableIncreasedDifficultyChange')).toBe(true)
    })

    it('returns false if flag has activation sequence', () => {
      expect(consensus.isNeverActive('enableAssetOwnership')).toBe(false)
      expect(consensus.isNeverActive('enforceSequentialBlockTime')).toBe(false)
      expect(consensus.isNeverActive('enableFishHash')).toBe(false)
      expect(consensus.isNeverActive('enableIncreasedDifficultyChange')).toBe(false)
    })
  })

  describe('getActiveTransactionVersion', () => {
    it('returns the correct transaction version based on activation sequence', () => {
      expect(consensus.getActiveTransactionVersion(5)).toEqual(TransactionVersion.V1)
      expect(consensus.getActiveTransactionVersion(6)).toEqual(TransactionVersion.V1)
      expect(consensus.getActiveTransactionVersion(7)).toEqual(TransactionVersion.V2)
      expect(consensus.getActiveTransactionVersion(8)).toEqual(TransactionVersion.V2)
    })

    it('returns V1 transaction when activation flag is never', () => {
      expect(consensusWithInactives.getActiveTransactionVersion(5)).toEqual(
        TransactionVersion.V1,
      )
    })
  })

  describe('getDifficultyBucketMax', () => {
    it('returns the correct max bucket number based on activation sequence', () => {
      expect(consensus.getDifficultyBucketMax(8)).toEqual(99)
      expect(consensus.getDifficultyBucketMax(9)).toEqual(99)
      expect(consensus.getDifficultyBucketMax(10)).toEqual(200)
      expect(consensus.getDifficultyBucketMax(11)).toEqual(200)
    })

    it('returns 99 when activation flag is never', () => {
      expect(consensusWithInactives.getDifficultyBucketMax(5)).toEqual(99)
    })
  })

  describe('checkpoints', () => {
    it('returns correct hash for each checkpoint', () => {
      const consensusWithCheckpoints = new Consensus({
        ...params,
        checkpoints: [
          {
            sequence: 5,
            hash: 'hash5',
          },
          {
            sequence: 6,
            hash: 'hash6',
          },
        ],
      })

      expect(consensusWithCheckpoints.checkpoints.size).toEqual(2)

      expect(
        consensusWithCheckpoints.checkpoints.get(5)?.equals(Buffer.from('hash5', 'hex')),
      ).toBe(true)
      expect(
        consensusWithCheckpoints.checkpoints.get(6)?.equals(Buffer.from('hash6', 'hex')),
      ).toBe(true)
    })

    it('is empty if no checkpoints exist', () => {
      expect(consensus.checkpoints.size).toEqual(0)
      expect(consensus.checkpoints.get(5)).toBeUndefined()
      expect(consensus.checkpoints.get(6)).toBeUndefined()
    })
  })
})
