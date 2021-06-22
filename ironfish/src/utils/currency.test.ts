/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { displayIronAmountWithCurrency, ironToOre, isValidAmount, oreToIron } from './currency'

describe('Currency utils', () => {
  test('displayIronAmountWithCurrency returns the right string', () => {
    expect(displayIronAmountWithCurrency(0.00000002, true)).toEqual('$IRON 0.00000002 ($ORE 2)')
    expect(displayIronAmountWithCurrency(0.0000001, true)).toEqual('$IRON 0.00000010 ($ORE 10)')
    expect(displayIronAmountWithCurrency(0, true)).toEqual('$IRON 0.00000000 ($ORE 0)')
    expect(displayIronAmountWithCurrency(1, true)).toEqual(
      '$IRON 1.00000000 ($ORE 100,000,000)',
    )
    expect(displayIronAmountWithCurrency(100, true)).toEqual(
      '$IRON 100.00000000 ($ORE 10,000,000,000)',
    )
    expect(displayIronAmountWithCurrency(100, false)).toEqual('$IRON 100.00000000')
  })

  test('isValidAmount returns the right value', () => {
    expect(isValidAmount(0.0000000000001)).toBe(false)
    expect(isValidAmount(0.00000001)).toBe(true)
    expect(isValidAmount(10.000001)).toBe(true)
  })

  test('oreToIron returns the right value', () => {
    expect(oreToIron(2394)).toBe(0.00002394)
    expect(oreToIron(999)).toBe(0.00000999)
  })

  test('ironToOre returns the right value', () => {
    expect(ironToOre(0.00002394)).toBe(2394)
    expect(ironToOre(0.00000999)).toBe(999)
  })
})
