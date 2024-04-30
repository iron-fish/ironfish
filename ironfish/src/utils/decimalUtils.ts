/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export class DecimalUtils {
  /**
   * Render `value * 10 ^ decimals` as a string. `minPrecision` tells how \
   * many decimal places to pad the string with. \
   * e.g. 1 * 10 ^ 0 => '1' \
   *      1 * 10 ^ 0 with 2 min precision => '1.00' \
   */
  static render(value: bigint | number, decimals: number, minPrecision: number = 0): string {
    const normalized = this.normalize({ value: BigInt(value), decimals })
    value = normalized.value
    decimals = normalized.decimals

    if (value < 0) {
      return `-${this.render(value * -1n, decimals, minPrecision)}`
    }

    if (decimals < 0) {
      let decimalPos = value.toString().length
      let stringValue = value.toString()
      for (let i = 0; i < -decimals; i++) {
        if (decimalPos === 0) {
          stringValue = `0${stringValue}`
        } else {
          decimalPos--
        }
      }

      if (decimalPos === 0) {
        return `0.${stringValue.padEnd(minPrecision, '0')}`
      }

      return `${stringValue.slice(0, decimalPos)}.${stringValue
        .slice(decimalPos)
        .padEnd(minPrecision, '0')}`
    }

    const wholeString = (value * 10n ** BigInt(decimals)).toString()
    const decimalString = minPrecision > 0 ? `.${''.padEnd(minPrecision, '0')}` : ''

    return `${wholeString}${decimalString}`
  }

  /**
   * Decode a string into a bigint and the number of decimal places \
   * e.g. '1' => { value: 1n, decimals: 0 } \
   *      '1.01' => { value: 101n, decimals: -2 } \
   */
  static tryDecode(input: string): { value: bigint; decimals: number } {
    const split = input.split('.')

    if (split.length > 2) {
      throw new Error('too many decimal points')
    }

    if (split.length === 1) {
      return this.normalize({ value: BigInt(split[0]), decimals: 0 })
    }

    const whole = trimFromStart(split[0], '0')
    const fraction = trimFromEnd(split[1], '0')

    return this.normalize({ value: BigInt(whole + fraction), decimals: -fraction.length })
  }

  /**
   * Strips trailing zeroes from the value and moves them to the decimals \
   * e.g. 1000    => 1   * 10 ^ 3 => { value: 1, decimals: 3 } \
   *      4530000 => 453 * 10 ^ 4 => { value: 453, decimals: 4 }
   */
  static normalize(input: { value: bigint; decimals: number }): {
    value: bigint
    decimals: number
  } {
    if (input.value === 0n) {
      return { value: 0n, decimals: 0 }
    }
    const { value, decimals } = input

    let dividedValue = value
    let numZeros = 0
    while (dividedValue % 10n === 0n && dividedValue !== 0n) {
      dividedValue /= 10n
      numZeros++
    }

    return { value: dividedValue, decimals: decimals + numZeros }
  }
}

function trimFromEnd(input: string, c: string): string {
  return input.replace(new RegExp(`${c}+$`), '')
}

function trimFromStart(input: string, c: string): string {
  return input.replace(new RegExp(`^${c}+`), '')
}
