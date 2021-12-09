/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { Job } from '../job'
import { mineHeader } from '../../mining/mineHeader'

export type MineHeaderRequest = {
  type: 'mineHeader'
  batchSize: number
  headerBytesWithoutRandomness: Buffer
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
    headerBytesWithoutRandomness,
    initialRandomness,
    miningRequestId,
    targetValue,
    job,
  })

  return { type: 'mineHeader', ...result }
}
