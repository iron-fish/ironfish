/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Blockchain } from '../blockchain'
import { BlockHeader } from '../primitives'
import { GENESIS_BLOCK_SEQUENCE } from '../primitives/block'

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

  // Truncate fractions from parameters
  stop = Math.floor(stop)
  start = Math.floor(start)

  // Ensure values are in valid range and start < stop
  start = Math.min(Math.max(start, min), max)
  stop = Math.max(Math.min(Math.max(stop, min), max), start)

  return { start, stop }
}

// Returns the block header at the given sequence or hash
async function blockHeaderBySequenceOrHash(
  chain: Blockchain,
  start: Buffer | number,
): Promise<BlockHeader | null> {
  if (Buffer.isBuffer(start)) {
    return await chain.getHeader(start)
  }

  return await chain.getHeaderAtSequence(start)
}

export const BlockchainUtils = { getBlockRange, blockHeaderBySequenceOrHash }
