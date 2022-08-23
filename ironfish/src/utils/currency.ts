/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

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

export const oreToIron = (amount: number): number => {
  return amount / ORE_TO_IRON
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

export const displayOreAmountWithCurrency = (amount: number): string => {
  return `${ORE_TICKER} ${displayOreAmount(amount)}`
}

export const displayIronToOreRate = (): string => {
  const oreDisplay = displayOreAmountWithCurrency(MINIMUM_IRON_AMOUNT)
  const ironDisplay = displayIronAmountWithCurrency(MINIMUM_IRON_AMOUNT, false)
  return `(${oreDisplay} = ${ironDisplay})`
}
