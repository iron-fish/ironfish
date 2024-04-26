/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Exponent } from './exponent'

describe('Exponent', () => {
  it('render', () => {
    expect(new Exponent(1n).render()).toEqual('1')
    expect(new Exponent(1n).render(2)).toEqual('1.00')
    expect(new Exponent(-1n).render()).toEqual('-1')
    expect(new Exponent(-1n).render(2)).toEqual('-1.00')

    expect(new Exponent(100n).render()).toEqual('100')
    expect(new Exponent(100n).render(2)).toEqual('100.00')
    expect(new Exponent(-100n).render()).toEqual('-100')
    expect(new Exponent(-100n).render(2)).toEqual('-100.00')

    expect(new Exponent(505n).render()).toEqual('505')
    expect(new Exponent(505n).render(10)).toEqual('505.0000000000')
    expect(new Exponent(-505n).render()).toEqual('-505')
    expect(new Exponent(-505n).render(10)).toEqual('-505.0000000000')

    expect(new Exponent(50900030n, -10).render()).toEqual('0.005090003')
    expect(new Exponent(50900030n, -10).render(2)).toEqual('0.005090003')
    expect(new Exponent(50900030n, -10).render(12)).toEqual('0.005090003000')
    expect(new Exponent(-50900030n, -10).render()).toEqual('-0.005090003')
    expect(new Exponent(-50900030n, -10).render(2)).toEqual('-0.005090003')
    expect(new Exponent(-50900030n, -10).render(12)).toEqual('-0.005090003000')

    expect(new Exponent(452n, 5).render()).toEqual('45200000')
    expect(new Exponent(452n, 5).render(2)).toEqual('45200000.00')
    expect(new Exponent(-452n, 5).render()).toEqual('-45200000')
    expect(new Exponent(-452n, 5).render(2)).toEqual('-45200000.00')

    expect(new Exponent(0n, 5).render()).toEqual('0')
    expect(new Exponent(0n, 5).render(2)).toEqual('0.00')
    expect(new Exponent(-0n, 5).render()).toEqual('0')
    expect(new Exponent(-0n, 5).render(2)).toEqual('0.00')
  })

  it('tryParse', () => {
    expect(Exponent.tryParse('1')).toEqual(new Exponent(1n))
    expect(Exponent.tryParse('-1')).toEqual(new Exponent(-1n))
    expect(Exponent.tryParse('10')).toEqual(new Exponent(10n))
    expect(Exponent.tryParse('123')).toEqual(new Exponent(123n))

    expect(Exponent.tryParse('0')).toEqual(new Exponent(0n))
    expect(Exponent.tryParse('0.0')).toEqual(new Exponent(0n))

    expect(Exponent.tryParse('100.000')).toEqual(new Exponent(100n))
    expect(Exponent.tryParse('-100.000')).toEqual(new Exponent(-100n))
    expect(Exponent.tryParse('100.001')).toEqual(new Exponent(100001n, -3))
    expect(Exponent.tryParse('-100.001')).toEqual(new Exponent(-100001n, -3))

    expect(Exponent.tryParse('000.001')).toEqual(new Exponent(1n, -3))
    expect(Exponent.tryParse('000.001000')).toEqual(new Exponent(1n, -3))
    expect(Exponent.tryParse('-000.001000')).toEqual(new Exponent(-1n, -3))
    expect(Exponent.tryParse('123.4567')).toEqual(new Exponent(1234567n, -4))
    expect(Exponent.tryParse('-123.4567')).toEqual(new Exponent(-1234567n, -4))

    expect(() => Exponent.tryParse('123..4567')).toThrow('too many decimal points')
    expect(() => Exponent.tryParse('f')).toThrow('Cannot convert f to a BigInt')
  })

  it('mul', () => {
    expect(new Exponent(1n).mul(new Exponent(1n))).toEqual(new Exponent(1n))
    expect(new Exponent(1n).mul(new Exponent(0n))).toEqual(new Exponent(0n))

    expect(new Exponent(5n).mul(new Exponent(5n))).toEqual(new Exponent(25n))
    expect(
      new Exponent(BigInt(Number.MAX_SAFE_INTEGER)).mul(
        new Exponent(BigInt(Number.MAX_SAFE_INTEGER)),
      ),
    ).toEqual(new Exponent(BigInt(Number.MAX_SAFE_INTEGER) * BigInt(Number.MAX_SAFE_INTEGER)))
  })
})
