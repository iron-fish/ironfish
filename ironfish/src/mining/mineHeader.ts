/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { mineHeaderBatch as nativeMineHeaderBatch } from 'ironfish-rust-nodejs'
import { BigIntUtils } from '../utils/bigint'

export function mineHeader({
  miningRequestId,
  headerBytesWithoutRandomness,
  initialRandomness,
  targetValue,
  batchSize,
}: {
  miningRequestId: number
  headerBytesWithoutRandomness: Uint8Array
  initialRandomness: number
  targetValue: string
  batchSize: number
}): { initialRandomness: number; randomness?: number; miningRequestId?: number } {
  const headerBytes = Buffer.alloc(headerBytesWithoutRandomness.byteLength + 8)
  headerBytes.set(headerBytesWithoutRandomness, 8)

  const { randomness, foundMatch } = nativeMineHeaderBatch(
    headerBytes,
    initialRandomness,
    BigIntUtils.toBytesBE(BigInt(targetValue), 32),
    batchSize,
  )

  if (foundMatch) {
    return { initialRandomness, randomness, miningRequestId }
  } else {
    return { initialRandomness }
  }
}
