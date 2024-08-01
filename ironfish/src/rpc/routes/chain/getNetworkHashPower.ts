/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { BigIntUtils } from '../../../utils'
import { RpcValidationError } from '../../adapters'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'

export type GetNetworkHashPowerRequest =
  | {
      blocks?: number | null // number of blocks to look back
      sequence?: number | null // the sequence of the latest block from when to estimate the network speed
    }
  | undefined

export type GetNetworkHashPowerResponse = {
  hashesPerSecond: number
  blocks: number // The actual number of blocks used in the hash rate calculation
  sequence: number // The actual sequence of the latest block used in hash rate calculation
}

export const GetNetworkHashPowerRequestSchema: yup.ObjectSchema<GetNetworkHashPowerRequest> =
  yup
    .object({
      blocks: yup.number().nullable().optional(),
      sequence: yup.number().nullable().optional(),
    })
    .optional()

export const GetNetworkHashPowerResponseSchema: yup.ObjectSchema<GetNetworkHashPowerResponse> =
  yup
    .object({
      hashesPerSecond: yup.number().defined(),
      blocks: yup.number().defined(),
      sequence: yup.number().defined(),
    })
    .defined()

routes.register<typeof GetNetworkHashPowerRequestSchema, GetNetworkHashPowerResponse>(
  `${ApiNamespace.chain}/getNetworkHashPower`,
  GetNetworkHashPowerRequestSchema,
  async (request, context): Promise<void> => {
    Assert.isInstanceOf(context, FullNode)

    let blocks = request.data?.blocks ?? 120
    let sequence = request.data?.sequence ?? -1

    if (blocks < 0) {
      throw new RpcValidationError('[blocks] value must be greater than 0')
    }

    let endBlock = context.chain.head

    // If sequence is negative, it's relative to the head
    if (sequence < 0 && Math.abs(sequence) < context.chain.head.sequence) {
      sequence = context.chain.head.sequence + sequence
    }

    // estimate network hps at specified sequence
    // if the sequence is out of bounds, use the head as the last block
    if (sequence > 0 && sequence < context.chain.head.sequence) {
      const blockAtSequence = await context.chain.getHeaderAtSequence(sequence)
      if (!blockAtSequence) {
        throw new Error(`No end block found at sequence ${sequence}`)
      }
      endBlock = blockAtSequence
    }

    // Genesis block has sequence 1 - clamp blocks to prevent going out-of-bounds
    if (blocks >= endBlock.sequence) {
      blocks = endBlock.sequence - 1
    }

    const startBlock = await context.chain.getHeaderAtSequence(endBlock.sequence - blocks)
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
