/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { IJSON } from './iJson'

describe('IJSON', () => {
  describe('stringify', () => {
    it('should stringify bigints', () => {
      expect(IJSON.stringify({ num: BigInt(100) })).toBe('{"num":"100n"}')
    })

    it('should stringify negative bigints', () => {
      expect(IJSON.stringify({ num: BigInt(-100) })).toBe('{"num":"-100n"}')
    })

    it('should stringify 0 bigints', () => {
      expect(IJSON.stringify({ num: BigInt(0) })).toBe('{"num":"0n"}')
    })

    it('should stringify Buffers', () => {
      expect(IJSON.stringify({ buf: Buffer.from('a') })).toBe(
        '{"buf":{"type":"Buffer","data":"base64:YQ=="}}',
      )
    })
  })

  describe('parse', () => {
    it('should parse positive bigints', () => {
      const result = IJSON.parse('{"num":"100n"}') as { num: bigint }
      expect(result.num).toEqual(BigInt(100))
    })

    it('should parse negative bigints', () => {
      const result = IJSON.parse('{"num":"-100n"}') as { num: bigint }
      expect(result.num).toEqual(BigInt(-100))
    })

    it('should parse 0 bigints', () => {
      const result = IJSON.parse('{"num":"0n"}') as { num: bigint }
      expect(result.num).toEqual(BigInt(0))
    })

    it('should not parse n as a bigint', () => {
      const result = IJSON.parse('{"num":"n"}') as { num: string }
      expect(result.num).toEqual('n')
    })

    it('should not parse regular numbers as bigints', () => {
      const result = IJSON.parse('{"num":100}') as { num: number }
      expect(result.num).toEqual(100)
    })

    it('should parse Buffers', () => {
      const result = IJSON.parse('{"buf":{"type":"Buffer","data":"base64:YQ=="}}') as {
        buf: Buffer
      }
      expect(result.buf).toEqual(Buffer.from('a'))
    })
  })
})
