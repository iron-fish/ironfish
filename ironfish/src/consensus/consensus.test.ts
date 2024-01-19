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
  }

  const consensus = new Consensus(params)

  const consensusWithNevers = new Consensus({
    ...params,
    enableAssetOwnership: 'never',
    enforceSequentialBlockTime: 'never',
    enableFishHash: 'never',
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
    })

    it('uses a minimum sequence of 1 if given a smaller sequence', () => {
      expect(consensus.isActive('allowedBlockFutureSeconds', -100)).toBe(true)
      expect(consensus.isActive('allowedBlockFutureSeconds', -1)).toBe(true)
      expect(consensus.isActive('allowedBlockFutureSeconds', 0)).toBe(true)
    })

    it('returns false if flag activation is never', () => {
      expect(consensusWithNevers.isActive('enableAssetOwnership', 3)).toBe(false)
      expect(consensusWithNevers.isActive('enforceSequentialBlockTime', 3)).toBe(false)
      expect(consensusWithNevers.isActive('enableFishHash', 3)).toBe(false)
    })
  })

  describe('isNeverActive', () => {
    it('returns true if flag activation is never', () => {
      expect(consensusWithNevers.isNeverActive('enableAssetOwnership')).toBe(true)
      expect(consensusWithNevers.isNeverActive('enforceSequentialBlockTime')).toBe(true)
      expect(consensusWithNevers.isNeverActive('enableFishHash')).toBe(true)
    })

    it('returns false if flag has activation sequence', () => {
      expect(consensus.isNeverActive('enableAssetOwnership')).toBe(false)
      expect(consensus.isNeverActive('enforceSequentialBlockTime')).toBe(false)
      expect(consensus.isNeverActive('enableFishHash')).toBe(false)
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
      expect(consensusWithNevers.getActiveTransactionVersion(5)).toEqual(TransactionVersion.V1)
    })
  })
})
