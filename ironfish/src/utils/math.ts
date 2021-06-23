/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

function arrayAverage(values: number[]): number {
  if (values.length === 0) {
    return 0
  }

  let total = 0
  for (const value of values) {
    total += value
  }
  return total / values.length
}

function arraySum(values: number[]): number {
  if (values.length === 0) {
    return 0
  }

  let total = 0
  for (const value of values) {
    total += value
  }
  return total
}

function round(value: number, places: number): number {
  const scalar = Math.pow(10, places)
  return Math.round(value * scalar) / scalar
}

function max<T extends number | bigint>(a: T, b: T): T {
  return a > b ? a : b
}

function min<T extends number | bigint>(a: T, b: T): T {
  return a > b ? b : a
}

export const MathUtils = { arrayAverage, arraySum, round, min, max }
