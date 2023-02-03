/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { BigIntUtils } from '../../../utils'
import { ValidationError } from '../../adapters'
import { ApiNamespace, router } from '../router'

export type GetNetworkHashPowerRequest = {
  lookup?: number // number of blocks to lookup
  height?: number // estimate network speed at the time of the given height
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
    let lookup = request.data?.lookup ?? 120
    const height = request.data?.height ?? -1

    /*
      For bitcoin, a negative lookup specifies using all blocks since the last difficulty change.
      For ironfish, the difficulty changes for every block, so this isn't supported.
    */
    if (lookup < 0) {
      throw new ValidationError('Lookup value must be greater than 0')
    }

    let endBlock = node.chain.head

    // estimate network hps at specified height
    if (height > 0 && height < node.chain.head.sequence) {
      const blockAtHeight = await node.chain.getHeaderAtSequence(height)
      if (!blockAtHeight) {
        throw new Error(`No end block found at height ${height}`)
      }
      endBlock = blockAtHeight
    }

    // Genesis block has sequence 1 - clamp lookup to prevent going out-of-bounds
    if (lookup >= endBlock.sequence) {
      lookup = endBlock.sequence - 1
    }

    const startBlock = await node.chain.getHeaderAtSequence(endBlock.sequence - lookup)
    if (!startBlock) {
      throw new Error(`Failure to find start block ${endBlock.sequence - lookup}`)
    }

    const startTime = startBlock.timestamp.getTime()
    const endTime = endBlock.timestamp.getTime()

    // Don't divide by 0
    if (startTime === endTime) {
      request.end({
        hashesPerSecond: 0,
      })
      return
    }

    const workDifference = endBlock.work - startBlock.work
    const timeDifference = BigInt(endTime - startTime) // in milliseconds

    const hashesPerSecond = BigIntUtils.divide(workDifference, timeDifference) * 1000

    request.end({
      hashesPerSecond,
    })
  },
)
