/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { DecimalUtils } from './decimalUtils'

describe('DecimalUtils', () => {
  it('render', () => {
    expect(DecimalUtils.render(1n, 0)).toEqual('1')
    expect(DecimalUtils.render(1n, 0, 2)).toEqual('1.00')
    expect(DecimalUtils.render(-1n, 0, 0)).toEqual('-1')
    expect(DecimalUtils.render(-1n, 0, 2)).toEqual('-1.00')

    expect(DecimalUtils.render(100n, 0, 0)).toEqual('100')
    expect(DecimalUtils.render(100n, 0, 2)).toEqual('100.00')
    expect(DecimalUtils.render(-100n, 0, 0)).toEqual('-100')
    expect(DecimalUtils.render(-100n, 0, 2)).toEqual('-100.00')

    expect(DecimalUtils.render(505n, 0, 0)).toEqual('505')
    expect(DecimalUtils.render(505n, 0, 10)).toEqual('505.0000000000')
    expect(DecimalUtils.render(-505n, 0, 0)).toEqual('-505')
    expect(DecimalUtils.render(-505n, 0, 10)).toEqual('-505.0000000000')

    expect(DecimalUtils.render(50900030n, -10, 0)).toEqual('0.005090003')
    expect(DecimalUtils.render(50900030n, -10, 2)).toEqual('0.005090003')
    expect(DecimalUtils.render(50900030n, -10, 12)).toEqual('0.005090003000')
    expect(DecimalUtils.render(-50900030n, -10, 0)).toEqual('-0.005090003')
    expect(DecimalUtils.render(-50900030n, -10, 2)).toEqual('-0.005090003')
    expect(DecimalUtils.render(-50900030n, -10, 12)).toEqual('-0.005090003000')

    expect(DecimalUtils.render(452n, 5, 0)).toEqual('45200000')
    expect(DecimalUtils.render(452n, 5, 2)).toEqual('45200000.00')
    expect(DecimalUtils.render(-452n, 5, 0)).toEqual('-45200000')
    expect(DecimalUtils.render(-452n, 5, 2)).toEqual('-45200000.00')

    expect(DecimalUtils.render(0n, 5, 0)).toEqual('0')
    expect(DecimalUtils.render(0n, 5, 2)).toEqual('0.00')
    expect(DecimalUtils.render(-0n, 5, 0)).toEqual('0')
    expect(DecimalUtils.render(-0n, 5, 2)).toEqual('0.00')
  })

  it('tryParse', () => {
    expect(DecimalUtils.tryDecode('1')).toEqual({ value: 1n, decimals: 0 })
    expect(DecimalUtils.tryDecode('-1')).toEqual({ value: -1n, decimals: 0 })
    expect(DecimalUtils.tryDecode('10')).toEqual({ value: 1n, decimals: 1 })
    expect(DecimalUtils.tryDecode('123')).toEqual({ value: 123n, decimals: 0 })

    expect(DecimalUtils.tryDecode('0')).toEqual({ value: 0n, decimals: 0 })
    expect(DecimalUtils.tryDecode('0.0')).toEqual({ value: 0n, decimals: 0 })

    expect(DecimalUtils.tryDecode('100.000')).toEqual({ value: 1n, decimals: 2 })
    expect(DecimalUtils.tryDecode('-100.000')).toEqual({ value: -1n, decimals: 2 })
    expect(DecimalUtils.tryDecode('100.001')).toEqual({ value: 100001n, decimals: -3 })
    expect(DecimalUtils.tryDecode('-100.001')).toEqual({ value: -100001n, decimals: -3 })

    expect(DecimalUtils.tryDecode('000.001')).toEqual({ value: 1n, decimals: -3 })
    expect(DecimalUtils.tryDecode('000.001000')).toEqual({ value: 1n, decimals: -3 })
    expect(DecimalUtils.tryDecode('-000.001000')).toEqual({ value: -1n, decimals: -3 })
    expect(DecimalUtils.tryDecode('123.4567')).toEqual({ value: 1234567n, decimals: -4 })
    expect(DecimalUtils.tryDecode('-123.4567')).toEqual({ value: -1234567n, decimals: -4 })

    expect(() => DecimalUtils.tryDecode('123..4567')).toThrow('too many decimal points')
    expect(() => DecimalUtils.tryDecode('f')).toThrow('Cannot convert f to a BigInt')
  })
})
