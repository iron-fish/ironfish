/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BigNumberish, formatFixed, parseFixed } from '@ethersproject/bignumber'
import { commify } from '@ethersproject/units'

const ORE_TICKER = '$ORE'
const IRON_TICKER = '$IRON'
const ORE_TO_IRON = 100000000n
const DECIMALS = ORE_TO_IRON.toString().length - 1
export const MINIMUM_IRON_AMOUNT = '0.00000001'
export const MAXIMUM_IRON_AMOUNT = 18446744000000000000n
export const MINIMUM_ORE_AMOUNT = 1n
export const MAXIMUM_ORE_AMOUNT = parseFixed(
  MAXIMUM_IRON_AMOUNT.toString(),
  DECIMALS,
).toBigInt()

export const isValidIronAmount = (amount: string | number | undefined): boolean => {
  if (amount === undefined) {
    return false
  }
  try {
    const ore = ironToOre(amount)
    return ore >= MINIMUM_ORE_AMOUNT && ore <= MAXIMUM_ORE_AMOUNT
  } catch (e) {
    return false
  }
}

export const ironToOre = (amount: string | number): bigint => {
  return parseFixed(amount.toString(), DECIMALS).toBigInt()
}

export const oreToIron = (amount: BigNumberish): string => {
  return formatFixed(amount, DECIMALS)
}

export const displayIronAmount = (amount: string, decimals?: number): string => {
  let formattedDecimals = DECIMALS
  if (decimals !== undefined && Number.isInteger(decimals) && decimals >= 0) {
    formattedDecimals = Math.min(decimals, DECIMALS)
  }
  const commifyAmount = commify(amount)
  const index = commifyAmount.indexOf('.')
  if (index >= 0) {
    const currDecimals = commifyAmount.length - 1 - index
    if (currDecimals < formattedDecimals) {
      const diffDecimals = formattedDecimals - currDecimals
      let suffix = ''
      for (let i = 0; i < diffDecimals; i++) {
        suffix += '0'
      }
      return `${commifyAmount}${suffix}`
    } else if (currDecimals > formattedDecimals) {
      return commifyAmount.slice(0, index + 1 + formattedDecimals)
    } else {
      return commifyAmount
    }
  }
  let suffix = ''
  for (let i = 0; i < formattedDecimals; i++) {
    suffix += '0'
  }
  return `${commifyAmount}.${suffix}`
}

export const displayOreAmount = (amount: bigint): string => {
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

/*
 * Return a string with the format $IRON X.XXXXXXXX ($ORE X^8)
 */
export const displayIronAmountWithCurrency = (
  amount: string | number,
  displayOre: boolean,
): string => {
  let iron = `${IRON_TICKER} ${displayIronAmount(amount.toString())}`

  if (displayOre) {
    const oreAmount = ironToOre(amount)
    iron += ` (${ORE_TICKER} ${displayOreAmount(oreAmount)})`
  }

  return iron
}

function decode(amount: string): bigint {
  return BigInt(amount)
}

function encode(amount: bigint): string {
  return amount.toString()
}

function renderIron(amount: bigint | string, ticker = false): string {
  if (typeof amount === 'string') {
    amount = decode(amount)
  }

  const iron = displayIronAmount(oreToIron(amount))

  if (ticker) {
    return `$IRON ${iron}`
  }

  return iron
}

function renderOre(amount: bigint | string, ticker = false): string {
  if (typeof amount === 'string') {
    amount = decode(amount)
  }

  const ore = displayOreAmount(amount)

  if (ticker) {
    return `$ORE ${ore}`
  }

  return ore
}

function render(amount: bigint | string, ticker = false, ore = false): string {
  if (typeof amount === 'string') {
    amount = decode(amount)
  }

  if (ore) {
    return renderOre(amount, ticker)
  } else {
    return renderIron(amount, ticker)
  }
}

export const CurrencyUtils = {
  encode,
  decode,
  renderIron,
  renderOre,
  render,
}
