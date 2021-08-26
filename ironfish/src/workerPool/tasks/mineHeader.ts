/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { mineHeader } from '../../mining/miner'
import { Job } from '../job'

export type MineHeaderRequest = {
  type: 'mineHeader'
  batchSize: number
  headerBytesWithoutRandomness: Uint8Array
  initialRandomness: number
  miningRequestId: number
  targetValue: string
}

export type MineHeaderResponse = {
  type: 'mineHeader'
  initialRandomness: number
  miningRequestId?: number
  randomness?: number
}

export function handleMineHeader(
  {
    batchSize,
    headerBytesWithoutRandomness,
    initialRandomness,
    miningRequestId,
    targetValue,
  }: MineHeaderRequest,
  job: Job,
): MineHeaderResponse {
  const result = mineHeader({
    batchSize,
    headerBytesWithoutRandomness: Buffer.from(headerBytesWithoutRandomness),
    initialRandomness,
    miningRequestId,
    targetValue,
    job,
  })

  return { type: 'mineHeader', ...result }
}
