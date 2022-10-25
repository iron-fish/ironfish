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
}
