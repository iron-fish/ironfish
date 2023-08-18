/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { TransactionUtils } from './transaction'

describe('TransactionUtils', () => {
  describe('versionSequenceDelta', () => {
    const maxVersionDelta = 10
    const minVersionDelta = 3
    const testPermutations = [
      { expirationDelta: undefined, expectedSequenceDelta: maxVersionDelta },
      { expirationDelta: -2, expectedSequenceDelta: 1 },
      { expirationDelta: -1, expectedSequenceDelta: 1 },
      { expirationDelta: 0, expectedSequenceDelta: maxVersionDelta },
      { expirationDelta: 1, expectedSequenceDelta: 1 },
      { expirationDelta: 2, expectedSequenceDelta: 2 },
      { expirationDelta: 3, expectedSequenceDelta: minVersionDelta },
      { expirationDelta: 4, expectedSequenceDelta: minVersionDelta },
      { expirationDelta: 5, expectedSequenceDelta: minVersionDelta },
      { expirationDelta: 6, expectedSequenceDelta: minVersionDelta },
      { expirationDelta: 7, expectedSequenceDelta: minVersionDelta },
      { expirationDelta: 8, expectedSequenceDelta: 4 },
      { expirationDelta: 9, expectedSequenceDelta: 4 },
      { expirationDelta: 10, expectedSequenceDelta: 5 },
      { expirationDelta: 11, expectedSequenceDelta: 5 },
      { expirationDelta: 12, expectedSequenceDelta: 6 },
      { expirationDelta: 13, expectedSequenceDelta: 6 },
      { expirationDelta: 14, expectedSequenceDelta: 7 },
      { expirationDelta: 15, expectedSequenceDelta: 7 },
      { expirationDelta: 16, expectedSequenceDelta: 8 },
      { expirationDelta: 17, expectedSequenceDelta: 8 },
      { expirationDelta: 18, expectedSequenceDelta: 9 },
      { expirationDelta: 19, expectedSequenceDelta: 9 },
      { expirationDelta: 20, expectedSequenceDelta: maxVersionDelta },
    ]
    // Sanity check higher values
    for (let i = 21; i < 100; i++) {
      testPermutations.push({ expirationDelta: i, expectedSequenceDelta: maxVersionDelta })
    }
    testPermutations.forEach(({ expirationDelta, expectedSequenceDelta }) => {
      it(`expirationDelta: ${expirationDelta ?? 'undefined'}`, () => {
        expect(TransactionUtils.versionSequenceDelta(expirationDelta)).toEqual(
          expectedSequenceDelta,
        )
      })
    })
  })
})
