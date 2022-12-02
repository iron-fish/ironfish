/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CurrencyUtils } from './currency'

describe('CurrencyUtils', () => {
  it('encode', () => {
    expect(CurrencyUtils.encode(0n)).toEqual('0')
    expect(CurrencyUtils.encode(1n)).toEqual('1')
    expect(CurrencyUtils.encode(100n)).toEqual('100')
    expect(CurrencyUtils.encode(10000n)).toEqual('10000')
    expect(CurrencyUtils.encode(100000000n)).toEqual('100000000')
  })

  it('decode', () => {
    expect(CurrencyUtils.decode('0')).toEqual(0n)
    expect(CurrencyUtils.decode('1')).toEqual(1n)
    expect(CurrencyUtils.decode('100')).toEqual(100n)
    expect(CurrencyUtils.decode('10000')).toEqual(10000n)
    expect(CurrencyUtils.decode('100000000')).toEqual(100000000n)
  })

  it('encodeIron', () => {
    expect(CurrencyUtils.encodeIron(0n)).toEqual('0.0')
    expect(CurrencyUtils.encodeIron(1n)).toEqual('0.00000001')
    expect(CurrencyUtils.encodeIron(100n)).toEqual('0.000001')
    expect(CurrencyUtils.encodeIron(10000n)).toEqual('0.0001')
    expect(CurrencyUtils.encodeIron(100000000n)).toEqual('1.0')

    expect(CurrencyUtils.encodeIron(2394n)).toBe('0.00002394')
    expect(CurrencyUtils.encodeIron(999n)).toBe('0.00000999')
  })

  it('decodeIron', () => {
    expect(CurrencyUtils.decodeIron('0.0')).toEqual(0n)
    expect(CurrencyUtils.decodeIron('0.00000001')).toEqual(1n)
    expect(CurrencyUtils.decodeIron('0.000001')).toEqual(100n)
    expect(CurrencyUtils.decodeIron('0.0001')).toEqual(10000n)
    expect(CurrencyUtils.decodeIron('1.0')).toEqual(100000000n)

    expect(CurrencyUtils.decodeIron('0.00002394')).toBe(2394n)
    expect(CurrencyUtils.decodeIron('0.00000999')).toBe(999n)
  })

  it('renderIron', () => {
    expect(CurrencyUtils.renderIron(0n)).toEqual('0.00000000')
    expect(CurrencyUtils.renderIron(1n)).toEqual('0.00000001')
    expect(CurrencyUtils.renderIron(100n)).toEqual('0.00000100')
    expect(CurrencyUtils.renderIron(10000n)).toEqual('0.00010000')
    expect(CurrencyUtils.renderIron(100000000n)).toEqual('1.00000000')
    expect(CurrencyUtils.renderIron(1n, true)).toEqual('$IRON 0.00000001')
  })

  it('renderOre', () => {
    expect(CurrencyUtils.renderOre(0n)).toEqual('0')
    expect(CurrencyUtils.renderOre(1n)).toEqual('1')
    expect(CurrencyUtils.renderOre(100n)).toEqual('100')
    expect(CurrencyUtils.renderOre(10000n)).toEqual('10000')
    expect(CurrencyUtils.renderOre(100000000n)).toEqual('100000000')
    expect(CurrencyUtils.renderOre(1n, true)).toEqual('$ORE 1')
  })
})
