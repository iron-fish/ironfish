/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { StorageUtils } from '../database/utils'

describe('StorageUtils', () => {
  describe('getPrefixKeyRange', () => {
    it('should single byte generate prefix', () => {
      const prefix = Buffer.alloc(1, 2)
      const range = StorageUtils.getPrefixKeyRange(prefix)

      expect(range.gte.byteLength).toBe(1)
      expect(range.lt.byteLength).toBe(1)
      expect(range.gte[0]).toBe(2)
      expect(range.lt[0]).toBe(3)
    })

    it('should multi byte generate prefix', () => {
      const prefix = Buffer.concat([Buffer.alloc(1, 2), Buffer.alloc(1, 4)])
      const range = StorageUtils.getPrefixKeyRange(prefix)

      expect(range.gte.byteLength).toBe(2)
      expect(range.lt.byteLength).toBe(2)
      expect(range.gte[0]).toBe(2)
      expect(range.gte[1]).toBe(4)
      expect(range.lt[0]).toBe(2)
      expect(range.lt[1]).toBe(5)
    })

    it('should check buffer range', () => {
      const b = (v: number) => Buffer.alloc(1, v)

      // 0 <= 1 <= 2
      expect(
        StorageUtils.isInRange(b(1), {
          gte: b(0),
          lte: b(2),
        }),
      ).toBe(true)

      // 0 < 1 < 2
      expect(
        StorageUtils.isInRange(b(1), {
          gt: b(0),
          lt: b(2),
        }),
      ).toBe(true)

      // 0 < 0 < 2
      expect(
        StorageUtils.isInRange(b(0), {
          gt: b(0),
          lt: b(2),
        }),
      ).toBe(false)

      // 0 < 2 < 2
      expect(
        StorageUtils.isInRange(b(2), {
          gt: b(0),
          lt: b(2),
        }),
      ).toBe(false)
    })
  })
})
