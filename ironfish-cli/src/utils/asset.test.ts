/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { AssetVerification } from '@ironfish/sdk'
import { compareAssets } from './asset'

describe('asset utils', () => {
  describe('compareAssets', () => {
    it('returns 1/0/-1 depending on sort order', () => {
      const verified = { status: 'verified' } as AssetVerification
      const unverified = { status: 'unverified' } as AssetVerification

      expect(compareAssets('a', verified, 'b', unverified)).toEqual(-1)
      expect(compareAssets('b', unverified, 'a', verified)).toEqual(1)

      expect(compareAssets('b', verified, 'a', unverified)).toEqual(-1)
      expect(compareAssets('a', unverified, 'b', verified)).toEqual(1)

      expect(compareAssets('a', verified, 'b', verified)).toEqual(-1)
      expect(compareAssets('b', verified, 'a', verified)).toEqual(1)

      expect(compareAssets('a', unverified, 'b', unverified)).toEqual(-1)
      expect(compareAssets('b', unverified, 'a', unverified)).toEqual(1)

      expect(compareAssets('a', verified, 'a', verified)).toEqual(0)
      expect(compareAssets('a', unverified, 'a', unverified)).toEqual(0)
    })

    it('can be used to sort assets by verified status first, and name second', () => {
      const verified = { status: 'verified' } as AssetVerification
      const unverified = { status: 'unverified' } as AssetVerification
      const unknown = { status: 'unknown' } as AssetVerification

      const assets = [
        { name: 'aaa', verification: unknown },
        { name: 'bbb', verification: unverified },
        { name: 'ccc', verification: verified },
        { name: 'fff', verification: verified },
        { name: 'eee', verification: unverified },
        { name: 'ddd', verification: unknown },
      ]

      assets.sort((left, right) =>
        compareAssets(left.name, left.verification, right.name, right.verification),
      )

      expect(assets).toStrictEqual([
        { name: 'ccc', verification: verified },
        { name: 'fff', verification: verified },
        { name: 'aaa', verification: unknown },
        { name: 'bbb', verification: unverified },
        { name: 'ddd', verification: unknown },
        { name: 'eee', verification: unverified },
      ])
    })
  })
})
