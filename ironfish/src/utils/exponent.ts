/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Represents a value with a base 10 exponent \
 * e.g. `value` * 10 ^ `exp` where `value` is a bigint
 */
export class Exponent {
  readonly value: bigint
  readonly exp: number
  constructor(value: bigint, exp: number = 0) {
    const [strippedValue, numZeros] = Exponent.stripZeros(value)
    this.value = strippedValue
    this.exp = exp + numZeros
  }

  /**
   * Strips trailing zeroes from the value and moves them to the exponent \
   * e.g. 1000    => 1   * 10 ^ 3 => [1,   3] \
   *      4530000 => 453 * 10 ^ 4 => [453, 4]
   *
   * This makes other methods more efficient
   */
  private static stripZeros(value: bigint): [bigint, number] {
    let dividedValue = value
    let numZeros = 0
    while (dividedValue % 10n === 0n && dividedValue !== 0n) {
      dividedValue /= 10n
      numZeros++
    }

    return [dividedValue, numZeros]
  }

  render(minPrecision: number = 0): string {
    if (this.exp < 0) {
      if (this.value < 0) {
        return `-${this.abs().render(minPrecision)}`
      } else {
        let decimalPos = this.value.toString().length
        let stringValue = this.value.toString()
        for (let i = 0; i < -this.exp; i++) {
          if (decimalPos === 0) {
            stringValue = `0${stringValue}`
          } else {
            decimalPos--
          }
        }

        if (decimalPos === 0) {
          return `0.${stringValue.padEnd(minPrecision, '0')}`
        } else {
          return `${stringValue.slice(0, decimalPos)}.${stringValue
            .slice(decimalPos)
            .padEnd(minPrecision, '0')}`
        }
      }
    }

    if (minPrecision > 0) {
      return `${this.tryToBigInt().toString()}.${''.padEnd(minPrecision, '0')}`
    }

    return this.tryToBigInt().toString()
  }

  abs(): Exponent {
    return new Exponent(this.value < 0 ? -this.value : this.value, this.exp)
  }

  mul(other: Exponent): Exponent {
    return new Exponent(this.value * other.value, this.exp + other.exp)
  }

  tryToBigInt(): bigint {
    if (this.exp < 0) {
      throw new Error('cannot convert to bigint')
    }

    return this.value * BigInt(10n ** BigInt(this.exp))
  }

  static tryParse(input: string): Exponent {
    const split = input.split('.')

    if (split.length > 2) {
      throw new Error('too many decimal points')
    }

    if (split.length === 1) {
      return new Exponent(BigInt(split[0]), 0)
    }

    const whole = trimFromStart(split[0], '0')
    const fraction = trimFromEnd(split[1], '0')

    const decimals = fraction.length
    const value = BigInt(whole + fraction)
    return new Exponent(value, -decimals)
  }
}

function trimFromEnd(input: string, c: string): string {
  return input.replace(new RegExp(`${c}+$`), '')
}

function trimFromStart(input: string, c: string): string {
  return input.replace(new RegExp(`^${c}+`), '')
}
