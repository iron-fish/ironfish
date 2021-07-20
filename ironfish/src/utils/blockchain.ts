/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Blockchain } from '../blockchain'
import { GENESIS_BLOCK_SEQUENCE } from '../consensus/consensus'

export function getBlockRange(
  chain: Blockchain,
  range?: {
    start?: number | null
    stop?: number | null
  },
): { start: number; stop: number } {
  const min = Number(GENESIS_BLOCK_SEQUENCE)
  const max = Number(chain.latest.sequence)

  let start = range?.start ? range.start : min
  let stop = range?.stop ? range.stop : max

  // Negative numbers start from the end
  if (start < 0) {
    start = max + start
  }
  if (stop < 0) {
    stop = max + stop
  }

  // Ensure values are in valid range and start < stop
  start = Math.min(Math.max(start, min), max)
  stop = Math.max(Math.min(Math.max(stop, min), max), start)

  return { start, stop }
}

export const BlockchainUtils = { getBlockRange }
