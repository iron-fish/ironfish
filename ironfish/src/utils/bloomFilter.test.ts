/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { randomBytes } from 'crypto'
import { BloomFilter } from './bloomFilter'

describe('BloomFilter', () => {
  describe('maybeHas', () => {
    it('always returns false when empty', () => {
      const filter = new BloomFilter(256)

      for (let i = 0; i < 1000; i++) {
        const item = randomBytes(32)
        expect(filter.maybeHas(item)).toBe(false)
      }
    })

    it('returns true for all items that were explicitly put', () => {
      const filter = new BloomFilter(256)

      for (let i = 0; i < 1000; i++) {
        const item = randomBytes(32)
        filter.put(item)
        expect(filter.maybeHas(item)).toBe(true)
      }
    })

    it('returns true for items that were not explicitly but, but have the same prefix as previously put items', () => {
      const filter = new BloomFilter(512)

      const samePrefix = [
        Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]),
        Buffer.from([1, 2, 3, 4, 9, 10, 11, 12]),
        Buffer.from([1, 2, 3, 4, 13, 14, 15, 16]),
      ]
      const differentPrefix = [
        Buffer.from([1, 1, 1, 1, 1, 1, 1, 1]),
        Buffer.from([2, 2, 2, 2, 2, 2, 2, 2]),
        Buffer.from([3, 3, 3, 3, 3, 3, 3, 3]),
      ]

      filter.put(samePrefix[0])

      for (const item of samePrefix) {
        expect(filter.maybeHas(item)).toBe(true)
      }
      for (const item of differentPrefix) {
        expect(filter.maybeHas(item)).toBe(false)
      }
    })
  })
})
