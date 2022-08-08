/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Utility to compute the percentile using Nearest Rank Method
 * http://en.wikipedia.org/wiki/Percentile#The_Nearest_Rank_method
 *
 * inspired by https://github.com/msn0/stats-percentile/blob/master/index.js
 */
function swap(data: number[], i: number, j: number): number | undefined {
  if (i === j) {
    return
  }
  const tmp = data[j]
  data[j] = data[i]
  data[i] = tmp
}

function partition(data: number[], start: number, end: number): number {
  let i, j
  for (i = start + 1, j = start; i < end; i++) {
    if (data[i] < data[start]) {
      swap(data, i, ++j)
    }
  }
  swap(data, start, j)
  return j
}

function findK(data: number[], start: number, end: number, k: number): number | null {
  while (start < end) {
    const pos = partition(data, start, end)
    if (pos === k) {
      return data[k]
    }
    if (pos > k) {
      end = pos
    } else {
      start = pos + 1
    }
  }

  return null
}

export default function (data: number[], n: number): number | null {
  return findK(data.slice(), 0, data.length, Math.ceil((data.length * n) / 100) - 1)
}
