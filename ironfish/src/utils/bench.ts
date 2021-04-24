/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

type HRTime = [seconds: number, nanoseconds: number]

function start(): HRTime {
  return process.hrtime()
}

/**
 * @returns milliseconds since start
 */
function end(start: HRTime): number {
  const [sec, nanosec] = process.hrtime(start)
  return sec * 1000 + nanosec / 1e6
}

export const BenchUtils = { start, end }
