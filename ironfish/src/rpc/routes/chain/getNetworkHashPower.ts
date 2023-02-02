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
    // default values for lookup and height
    let lookup = 120
    let height = -1

    if (request.data?.lookup) {
      lookup = request.data.lookup
    }

    if (request.data?.height) {
      height = request.data.height
    }

    let startBlock = node.chain.head

    // set start block to the block at height
    if (height >= 0 && height < node.chain.head.sequence) {
      const blockAtHeight = await node.chain.getHeaderAtSequence(height)
      if (blockAtHeight) {
        startBlock = blockAtHeight
      } else {
        throw new Error(`No block found at height ${height}`)
      }
    }

    if (lookup <= 0) {
      // TODO: set lookup to all blocks since last difficulty change
    }

    if (lookup > startBlock.sequence) {
      lookup = startBlock.sequence
    }

    let minTime = startBlock.timestamp
    let maxTime = startBlock.timestamp

    let currentBlock = startBlock

    // TODO: can we skip iterating and just index directly to seq - lookup
    for (let i = 0; i < lookup; ++i) {
      const previousBlock = await node.chain.getHeader(currentBlock.previousBlockHash)
      if (previousBlock) {
        const previousBlockTime = previousBlock.timestamp

        minTime = previousBlockTime < minTime ? previousBlockTime : minTime
        maxTime = previousBlockTime > maxTime ? previousBlockTime : maxTime

        currentBlock = previousBlock
      } else {
        // TODO: should we throw an error here?
        throw new Error(`No block found at height ${currentBlock.sequence - 1}}`)
      }
    }

    // Don't divide by 0
    if (minTime == maxTime) {
      request.end({
        hashesPerSecond: 0,
      })
    }

    const workDifference = startBlock.work - currentBlock.work
    const timeDifference = (maxTime.getTime() - minTime.getTime()) / 1000 // in seconds

    const hashesPerSecond = Number(workDifference) / timeDifference

    request.end({
      hashesPerSecond,
    })
  },
)
