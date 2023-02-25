/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { formatFixed, parseFixed } from '@ethersproject/bignumber'
import { isNativeIdentifier } from './asset'
import { BigIntUtils } from './bigint'
import { FixedNumberUtils } from './fixedNumber'

export class CurrencyUtils {
  static locale?: string

  /**
   * Serializes ore as iron with up to 8 decimal places
   */
  static encodeIron(amount: bigint): string {
    return formatFixed(amount, 8)
  }

  /**
   * Parses iron into ore
   */
  static decodeIron(amount: string | number): bigint {
    return parseFixed(amount.toString(), 8).toBigInt()
  }

  /**
   * Deserialize ore back into bigint
   */
  static decode(amount: string): bigint {
    return BigInt(amount)
  }

  static decodeTry(amount: string): [bigint, null] | [null, Error] {
    return BigIntUtils.tryParse(amount)
  }

  /**
   * Serialize ore into a string
   */
  static encode(amount: bigint): string {
    return amount.toString()
  }

  /*
   * Renders ore as iron for human-readable purposes
   */
  static renderIron(amount: bigint | string, includeTicker = false, assetId?: string): string {
    if (typeof amount === 'string') {
      amount = this.decode(amount)
    }

    const iron = FixedNumberUtils.render(amount, 8)

    if (includeTicker) {
      let ticker = '$IRON'
      if (assetId && !isNativeIdentifier(assetId)) {
        ticker = assetId
      }
      return `${ticker} ${iron}`
    }

    return iron
  }

  /*
   * Renders ore for human-readable purposes
   */
  static renderOre(amount: bigint | string, includeTicker = false, assetId?: string): string {
    if (typeof amount === 'string') {
      amount = this.decode(amount)
    }

    const ore = amount.toString()

    if (includeTicker) {
      let ticker = '$ORE'
      if (assetId && !isNativeIdentifier(assetId)) {
        ticker = assetId
      }
      return `${ticker} ${ore}`
    }

    return ore
  }
}

export const ORE_TO_IRON = 100000000
export const MINIMUM_ORE_AMOUNT = 0n
export const MAXIMUM_ORE_AMOUNT = 2n ** 64n
export const MINIMUM_IRON_AMOUNT = CurrencyUtils.renderIron(MINIMUM_ORE_AMOUNT)
export const MAXIMUM_IRON_AMOUNT = CurrencyUtils.renderIron(MAXIMUM_ORE_AMOUNT)
