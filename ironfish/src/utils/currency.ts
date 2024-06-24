/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { formatFixed, parseFixed } from '@ethersproject/bignumber'
import { isNativeIdentifier } from './asset'
import { BigIntUtils } from './bigint'
import { DecimalUtils } from './decimalUtils'

export class CurrencyUtils {
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

  /**
   * Parses a value in a major denomination as the minor denomination where possible:
   * - $IRON is always going to have 8 decimal places.
   * - If a custom asset, and `decimals` is provided, it will give the value
   * followed by a digit for each decimal place
   * - If a custom asset, and `decimals` is not provided, it will assume the
   * value is already in minor denomination with no decimal places
   *
   * Examples:
   * 1 $IRON = 100000000
   * A custom asset with 2 decimal places: 1 = 100
   * A custom asset with no decimal places: 1 = 1
   */
  static tryMajorToMinor(
    amount: bigint | string,
    assetId?: string,
    verifiedAssetMetadata?: {
      decimals?: number
    },
  ): [bigint, null] | [null, Error] {
    const { decimals } = assetMetadataWithDefaults(assetId, verifiedAssetMetadata)

    try {
      const major = DecimalUtils.tryDecode(amount.toString())
      const minor = { value: major.value, decimals: major.decimals + decimals }

      if (minor.decimals < 0) {
        return [null, Error('amount is too small to fit into the minor denomination')]
      }

      const minorValue = minor.value * 10n ** BigInt(minor.decimals)
      return [minorValue, null]
    } catch (e) {
      if (e instanceof Error) {
        return [null, e]
      }
      throw e
    }
  }

  /**
   * Renders a value in a minor denomination as the major denomination:
   * - $IRON is always going to have 8 decimal places.
   * - If a custom asset, and `decimals` is provided, it will give the value
   * followed by a digit for each decimal place
   * - If a custom asset, and `decimals` is not provided, it will assume the
   * value is already in minor denomination with no decimal places
   *
   * Examples:
   * 100000000 = 1 $IRON
   * A custom asset with 2 decimal places: 100 = 1
   * A custom asset with no decimal places: 1 = 1
   */
  static minorToMajor(
    amount: bigint,
    assetId?: string,
    verifiedAssetMetadata?: {
      decimals?: number
    },
  ): { value: bigint; decimals: number } {
    const { decimals } = assetMetadataWithDefaults(assetId, verifiedAssetMetadata)

    return DecimalUtils.normalize({ value: amount, decimals: -decimals })
  }

  /**
   * Renders values for human-readable purposes:
   * - Renders $IRON in the major denomination, with 8 decimal places
   * - If a custom asset, and `decimals` is provided, it will render the custom
   *     asset in the major denomination with the decimal places
   * - If a custom asset, and `decimals` is not provided, it will render the
   *     custom asset in the minor denomination with no decimal places
   */
  static render(
    amount: bigint | string,
    includeSymbol: boolean = false,
    assetId?: string,
    verifiedAssetMetadata?: {
      decimals?: number
      symbol?: string
    },
  ): string {
    const { value: majorValue, decimals: majorDecimals } = this.minorToMajor(
      BigInt(amount),
      assetId,
      verifiedAssetMetadata,
    )
    const { symbol, decimals } = assetMetadataWithDefaults(assetId, verifiedAssetMetadata)

    const renderedValue = DecimalUtils.render(majorValue, majorDecimals, decimals)

    if (includeSymbol) {
      return `${symbol} ${renderedValue}`
    }

    return renderedValue
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

const IRON_DECIMAL_PLACES = 8
const IRON_SYMBOL = '$IRON'
export const ORE_TO_IRON = 100000000
export const MINIMUM_ORE_AMOUNT = 0n
export const MAXIMUM_ORE_AMOUNT = 2n ** 64n

export function assetMetadataWithDefaults(
  assetId?: string,
  verifiedAssetMetadata?: {
    decimals?: number
    symbol?: string
  },
): {
  decimals: number
  symbol: string
} {
  let decimals: number
  let symbol: string
  // If an asset ID was provided, check if it is the native asset. Otherwise,
  // we can only assume that the amount is in the native asset
  const isNativeAsset = !assetId || isNativeIdentifier(assetId)
  if (isNativeAsset) {
    // Hard-code the amount of decimals in the native asset
    decimals = IRON_DECIMAL_PLACES
    symbol = IRON_SYMBOL
  } else {
    // Default to displaying 0 decimal places for custom assets
    decimals = verifiedAssetMetadata?.decimals || 0
    symbol = verifiedAssetMetadata?.symbol || assetId
  }

  return {
    decimals,
    symbol,
  }
}
