/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { DEFAULT_EXPLORER_BLOCKS_URL } from '../fileStores/config'
import { YupUtils } from './yup'

describe('YupUtils', () => {
  describe('schemas', () => {
    it('isWholeNumber', () => {
      expect(YupUtils.isPositiveInteger.isValidSync(0)).toBe(true)
      expect(YupUtils.isPositiveInteger.isValidSync(42)).toBe(true)
      expect(YupUtils.isPositiveInteger.isValidSync(false)).toBe(false)
      expect(YupUtils.isPositiveInteger.isValidSync(-1)).toBe(false)
      expect(YupUtils.isPositiveInteger.isValidSync(-1)).toBe(false)
    })

    it('isPercent', () => {
      expect(YupUtils.isPercent.isValidSync(0)).toBe(true)
      expect(YupUtils.isPercent.isValidSync(100)).toBe(true)
      expect(YupUtils.isPercent.isValidSync('10%')).toBe(false)
      expect(YupUtils.isPercent.isValidSync(101)).toBe(false)
    })

    it('isUrl', () => {
      expect(YupUtils.isUrl.isValidSync('192.168.1.0')).toBe(false)
      expect(YupUtils.isUrl.isValidSync(DEFAULT_EXPLORER_BLOCKS_URL)).toBe(true)
    })

    it('isPort', () => {
      expect(YupUtils.isPort.isValidSync(1)).toBe(true)
      expect(YupUtils.isPort.isValidSync(65535)).toBe(true)
      expect(YupUtils.isPort.isValidSync(-1)).toBe(false)
    })
  })
})
