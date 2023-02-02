/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ValidationError } from '../../adapters'
import { ApiNamespace, router } from '../router'

export type GetNetworkHashPowerRequest = {
  lookup?: number // number of blocks to lookup
  height?: number // estimate network speed at the time this block was found
}

export type GetNetworkHashPowerResponse = {
  hashesPerSecond: number
}

export const GetNetworkHashPowerRequestSchema: yup.ObjectSchema<GetNetworkHashPowerRequest> =
  yup
    .object({
      lookup: yup.number().optional(),
      height: yup.number().optional(),
    })
    .defined()

export const GetNetworkHashPowerResponseSchema: yup.ObjectSchema<GetNetworkHashPowerResponse> =
  yup
    .object({
      hashesPerSecond: yup.number().defined(),
    })
    .defined()

router.register<typeof GetNetworkHashPowerRequestSchema, GetNetworkHashPowerResponse>(
  `${ApiNamespace.chain}/getNetworkHashPower`,
  GetNetworkHashPowerRequestSchema,
  async (request, node): Promise<void> => {
    const sequence = node.chain.head.sequence

    // default values for lookup and height
    let lookup = 120
    let height = -1

    if (request.data?.lookup) {
      lookup = request.data.lookup
    }

    if (request.data?.height) {
      height = request.data.height
    }

    let currentBlock = node.chain.head

    if (height >= 0 && height < sequence) {
      // set block to the block at height
      const blockAtHeight = await node.chain.getHeaderAtSequence(height)
      if (blockAtHeight) {
        currentBlock = blockAtHeight
      } else {
        // TODO: exit / handle
      }
    }

    if (lookup <= 0) {
      // TODO: set lookup to all blocks since last difficulty change
    }

    if (lookup > sequence) {
      lookup = sequence
    }

    let minTime = currentBlock.timestamp
    let maxTime = currentBlock.timestamp

    for (let i = 0; i < lookup; i++) {
      const previousBlock = await node.chain.getHeader(currentBlock.previousBlockHash)
      if (previousBlock) {
        // do something
        currentBlock = previousBlock

        const previousBlockTime = currentBlock.timestamp

        minTime = previousBlockTime < minTime ? currentBlock.timestamp : minTime
        maxTime = previousBlockTime > maxTime ? currentBlock.timestamp : maxTime
      } else {
        // TODO: block DNE, do something
      }
    }

    // Don't divide by 0
    if (minTime == maxTime) {
      request.end({
        hashesPerSecond: 0,
      })
    }

    const workDifference = node.chain.head.work - currentBlock.work
    const timeDifference = (maxTime.getTime() - minTime.getTime()) / 1000

    const hashesPerSecond = Number(workDifference) / timeDifference

    request.end({
      hashesPerSecond,
    })
  },
)
