/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { formatFixed, parseFixed } from '@ethersproject/bignumber'
import { ErrorUtils } from './error'
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
   * Parses iron as ore
   */
  static decodeIron(amount: string | number): bigint {
    return parseFixed(amount.toString(), 8).toBigInt()
  }

  /**
   * Deseialize ore back into bigint
   */
  static decode(amount: string): bigint {
    return BigInt(amount)
  }

  /**
   * Serialize ore into a string
   */
  static encode(amount: bigint): string {
    return amount.toString()
  }

  /*
   * Renders ore as iron for human readable purposes
   */
  static renderIron(amount: bigint | string, ticker = false): string {
    if (typeof amount === 'string') {
      amount = this.decode(amount)
    }

    const iron = FixedNumberUtils.render(amount, 8)

    if (ticker) {
      return `$IRON ${iron}`
    }

    return iron
  }

  /*
   * Renders ore for human readable purposes
   */
  static renderOre(amount: bigint | string, ticker = false): string {
    if (typeof amount === 'string') {
      amount = this.decode(amount)
    }

    const ore = amount.toString()

    if (ticker) {
      return `$ORE ${ore}`
    }

    return ore
  }

  /*
   * Renders ore as either ore or iron for human readable purposes
   */
  static render(amount: bigint | string, ticker = false, ore = false): string {
    if (typeof amount === 'string') {
      amount = this.decode(amount)
    }

    if (ore) {
      return this.renderOre(amount, ticker)
    } else {
      return this.renderIron(amount, ticker)
    }
  }

  static isValidIron(amount: string): boolean {
    try {
      const ore = this.decodeIron(amount)
      return ore >= MINIMUM_ORE_AMOUNT && ore <= MAXIMUM_ORE_AMOUNT
    } catch (e) {
      if (ErrorUtils.isNodeError(e) && e.code === 'NUMERIC_FAULT') {
        return false
      }
      throw e
    }
  }
}

export const ORE_TO_IRON = 100000000
export const MINIMUM_ORE_AMOUNT = 0n
export const MAXIMUM_ORE_AMOUNT = 2n ** 64n
export const MINIMUM_IRON_AMOUNT = CurrencyUtils.renderIron(MINIMUM_ORE_AMOUNT)
export const MAXIMUM_IRON_AMOUNT = CurrencyUtils.renderIron(MAXIMUM_ORE_AMOUNT)
