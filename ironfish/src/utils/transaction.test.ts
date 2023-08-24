/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { TransactionUtils } from './transaction'

describe('TransactionUtils', () => {
  describe('versionSequenceDelta', () => {
    const maxSequenceDelta = 10
    const minSequenceDelta = 4
    const testPermutations = [
      { expirationDelta: 0, expectedSequenceDelta: maxSequenceDelta },
      { expirationDelta: 1, expectedSequenceDelta: 1 },
      { expirationDelta: 2, expectedSequenceDelta: 2 },
      { expirationDelta: 3, expectedSequenceDelta: 3 },
      { expirationDelta: 4, expectedSequenceDelta: minSequenceDelta },
      { expirationDelta: 5, expectedSequenceDelta: minSequenceDelta },
      { expirationDelta: 6, expectedSequenceDelta: minSequenceDelta },
      { expirationDelta: 7, expectedSequenceDelta: minSequenceDelta },
      { expirationDelta: 8, expectedSequenceDelta: minSequenceDelta },
      { expirationDelta: 9, expectedSequenceDelta: minSequenceDelta },
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
      { expirationDelta: 20, expectedSequenceDelta: maxSequenceDelta },
    ]
    // Sanity check higher values
    for (let i = 21; i < 100; i++) {
      testPermutations.push({ expirationDelta: i, expectedSequenceDelta: maxSequenceDelta })
    }
    testPermutations.forEach(({ expirationDelta, expectedSequenceDelta }) => {
      it(`expirationDelta: ${expirationDelta}`, () => {
        expect(TransactionUtils.versionSequenceDelta(expirationDelta)).toEqual(
          expectedSequenceDelta,
        )
      })
    })

    it('throws an error if a negative number is given', () => {
      const error = 'Expected expirationDelta to be greater than or equal to 0'
      expect(() => TransactionUtils.versionSequenceDelta(-1)).toThrow(error)
    })
  })
})
