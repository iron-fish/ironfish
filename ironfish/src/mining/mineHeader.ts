/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { hashBlockHeader } from '../primitives/blockheader'
import { Target } from '../primitives/target'
import { Job } from '../workerPool/job'

/**
 * Given header bytes and a target value, attempts to find a randomness
 * value that causes the header hash to meet the target.
 *
 * @param headerBytesWithoutRandomness The bytes to be appended to randomness to generate a header
 * @param miningRequestId An identifier that is passed back to the miner when returning a
 *        successfully mined block
 * @param initialRandomness The first randomness value to attempt. Will try the next
 *        batchSize randomness values after that
 * @param targetValue The target value that a block hash must meet.
 * @param batchSize The number of attempts to mine that should be made in this batch.
 *        Each attempt increments the randomness starting from initialRandomness
 */
export function mineHeader({
  miningRequestId,
  headerBytesWithoutRandomness,
  initialRandomness,
  targetValue,
  batchSize,
  job,
}: {
  miningRequestId: number
  headerBytesWithoutRandomness: Buffer
  initialRandomness: number
  targetValue: string
  batchSize: number
  job?: Job
}): { initialRandomness: number; randomness?: number; miningRequestId?: number } {
  const target = new Target(targetValue)
  const randomnessBytes = new ArrayBuffer(8)

  for (let i = 0; i < batchSize; i++) {
    if (job?.status === 'aborted') {
      break
    }

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
