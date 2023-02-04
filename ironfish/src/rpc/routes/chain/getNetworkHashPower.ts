/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { BigIntUtils } from '../../../utils'
import { ValidationError } from '../../adapters'
import { ApiNamespace, router } from '../router'

export type GetNetworkHashPowerRequest = {
  blocks?: number // number of blocks to look back
  sequence?: number // the sequence of the latest block from when to estimate the network speed
}

export type GetNetworkHashPowerResponse = {
  hashesPerSecond: number
  blocks: number // The actual number of blocks used in the hash rate calculation
  sequence: number // The actual sequence of the latest block used in hash rate calculation
}

export const GetNetworkHashPowerRequestSchema: yup.ObjectSchema<GetNetworkHashPowerRequest> =
  yup
    .object({
      blocks: yup.number().optional(),
      sequence: yup.number().optional(),
    })
    .defined()

export const GetNetworkHashPowerResponseSchema: yup.ObjectSchema<GetNetworkHashPowerResponse> =
  yup
    .object({
      hashesPerSecond: yup.number().defined(),
      blocks: yup.number().defined(),
      sequence: yup.number().defined(),
    })
    .defined()

router.register<typeof GetNetworkHashPowerRequestSchema, GetNetworkHashPowerResponse>(
  `${ApiNamespace.chain}/getNetworkHashPower`,
  GetNetworkHashPowerRequestSchema,
  async (request, node): Promise<void> => {
    let blocks = request.data?.blocks ?? 120
    const sequence = request.data?.sequence ?? -1

    /*
      For bitcoin, a negative blocks specifies using all blocks since the last difficulty change.
      For ironfish, the difficulty changes for every block, so this isn't supported.
    */
    if (blocks < 0) {
      throw new ValidationError('[blocks] value must be greater than 0')
    }

    let endBlock = node.chain.head

    // estimate network hps at specified sequence
    if (sequence > 0 && sequence < node.chain.head.sequence) {
      const blockAtSequence = await node.chain.getHeaderAtSequence(sequence)
      if (!blockAtSequence) {
        throw new Error(`No end block found at sequence ${sequence}`)
      }
      endBlock = blockAtSequence
    }

    // Genesis block has sequence 1 - clamp blocks to prevent going out-of-bounds
    if (blocks >= endBlock.sequence) {
      blocks = endBlock.sequence - 1
    }

    const startBlock = await node.chain.getHeaderAtSequence(endBlock.sequence - blocks)
    if (!startBlock) {
      throw new Error(`Failure to find start block ${endBlock.sequence - blocks}`)
    }

    const startTime = startBlock.timestamp.getTime()
    const endTime = endBlock.timestamp.getTime()

    // Don't divide by 0
    if (startTime === endTime) {
      request.end({
        hashesPerSecond: 0,
        blocks: blocks,
        sequence: endBlock.sequence,
      })
      return
    }

    const workDifference = endBlock.work - startBlock.work
    const timeDifference = BigInt(endTime - startTime) // in milliseconds

    const hashesPerSecond = BigIntUtils.divide(workDifference, timeDifference) * 1000

    request.end({
      hashesPerSecond,
      blocks,
      sequence: endBlock.sequence,
    })
  },
)
