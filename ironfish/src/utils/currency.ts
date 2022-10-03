/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BigIntUtils } from './bigint'

const ORE_TICKER = '$ORE'
const IRON_TICKER = '$IRON'
const ORE_TO_IRON = 100000000
export const MINIMUM_IRON_AMOUNT = 1 / ORE_TO_IRON
export const MAXIMUM_IRON_AMOUNT = 1.8446744e19
const FLOAT = ORE_TO_IRON.toString().length - 1

export const isValidAmount = (amount: number): boolean => {
  return amount >= MINIMUM_IRON_AMOUNT && amount <= MAXIMUM_IRON_AMOUNT
}

export const ironToOre = (amount: number): number => {
  const iron = amount * ORE_TO_IRON

  const pow = Math.pow(10, 0)
  return Math.round(iron * pow) / pow
}

export const oreToIron = (amount: number | bigint): number => {
  if (typeof amount === 'number') {
    return amount / ORE_TO_IRON
  } else {
    return BigIntUtils.divide(amount, BigInt(ORE_TO_IRON))
  }
}

export const displayIronAmount = (amount: number): string => {
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: FLOAT,
    maximumFractionDigits: FLOAT,
  })
}

export const displayOreAmount = (amount: number): string => {
  return ironToOre(amount).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

/*
 * Return a string with the format $IRON X.XXXXXXXX ($ORE X^8)
 */
export const displayIronAmountWithCurrency = (amount: number, displayOre: boolean): string => {
  let iron = `${IRON_TICKER} ${displayIronAmount(amount)}`

  if (displayOre) {
    iron += ` (${ORE_TICKER} ${displayOreAmount(amount)})`
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

  const amountIron = oreToIron(amount)

  const iron = amountIron.toLocaleString(undefined, {
    minimumFractionDigits: 8,
    maximumFractionDigits: 8,
  })

  if (ticker) {
    return `$IRON ${iron}`
  }

  return iron
}

function renderOre(amount: bigint | string, ticker = false): string {
  if (typeof amount === 'string') {
    amount = decode(amount)
  }

  const ore = amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })

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
