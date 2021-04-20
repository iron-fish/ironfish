/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { hashBlockHeader } from '../primitives/blockheader'
import { Target } from '../primitives/target'

/**
 * Expose a worker task that attempts to mine 1000 randomness
 * values.
 *
 * It hashes each value using the hashFunction and checks if
 * it meets the provided Target. If it does, that randomness
 * is return, otherwise it tries again.
 *
 * After 1000 numbers it exits, returning undefined
 *
 * @param headerBytesWithoutRandomness The bytes to be appended to randomness to generate a header
 * @param miningRequestId An identifier that is passed back to the miner when returning a
 *        successfully mined block
 * @param initialRandomness The first randomness value to attempt. Will try the next
 * 1000 randomness values after that
 * @param targetValue The target value that a valid block hash must be below for
 *        a given randomness
 * @param batchSize The number of attempts to mine that should be made in this batch
 *        each attempt increments the randomness starting from initialRandomness
 * @returns object with initialRandomness (useful as a promise identifier)
 *        and a randomness value that is either a successfully mined number or undefined,
 *        and the miningRequestId that was sent in
 */
export default function mineBatch({
  miningRequestId,
  headerBytesWithoutRandomness,
  initialRandomness,
  targetValue,
  batchSize,
}: {
  miningRequestId: number
  headerBytesWithoutRandomness: Buffer
  initialRandomness: number
  targetValue: string
  batchSize: number
}): { initialRandomness: number; randomness?: number; miningRequestId?: number } {
  const target = new Target(targetValue)
  const randomnessBytes = new ArrayBuffer(8)

  for (let i = 0; i < batchSize; i++) {
    // The intention here is to wrap randomness between 0 inclusive and Number.MAX_SAFE_INTEGER inclusive
    const randomness =
      i > Number.MAX_SAFE_INTEGER - initialRandomness
        ? i - (Number.MAX_SAFE_INTEGER - initialRandomness) - 1
        : initialRandomness + i
    new DataView(randomnessBytes).setFloat64(0, randomness, false)

    const headerBytes = Buffer.concat([
      Buffer.from(randomnessBytes),
      headerBytesWithoutRandomness,
    ])

    const blockHash = hashBlockHeader(headerBytes)

    if (Target.meets(new Target(blockHash).asBigInt(), target)) {
      return { initialRandomness, randomness, miningRequestId }
    }
  }
  return { initialRandomness }
}
