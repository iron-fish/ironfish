/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { formatFixed } from '@ethersproject/bignumber'

export class FixedNumberUtils {
  static render(amount: bigint | number, decimals: number): string {
    const value = formatFixed(amount, decimals)

    if (decimals === 0) {
      return value
    }

    const index = value.indexOf('.')
    const currDecimals = value.length - 1 - index

    if (currDecimals < decimals) {
      const diffDecimals = decimals - currDecimals
      let suffix = ''
      for (let i = 0; i < diffDecimals; i++) {
        suffix += '0'
      }

      return `${value}${suffix}`
    }

    if (currDecimals > decimals) {
      return value.slice(0, index + 1 + decimals)
    }

    return value
  }

  static trimFromEnd(input: string, c: string): string {
    return input.replace(new RegExp(`${c}+$`), '')
  }

  static trimFromStart(input: string, c: string): string {
    return input.replace(new RegExp(`^${c}+`), '')
  }

  static tryDecodeDecimal(input: string): { value: bigint; decimals: number } {
    const split = input.split('.')

    if (split.length > 2) {
      throw new Error('Invalid number of decimals')
    } else if (split.length === 1) {
      return { value: BigInt(split[0]), decimals: 0 }
    } else {
      const whole = this.trimFromStart(split[0], '0')
      const fraction = this.trimFromEnd(split[1], '0')

      const decimals = fraction.length
      const value = BigInt(whole + fraction)
      return { value, decimals }
    }
  }
}
