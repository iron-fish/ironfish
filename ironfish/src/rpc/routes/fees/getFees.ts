/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import percentile from '../../../utils/percentile'
import { ApiNamespace, router } from '../router'

export type GetFeesRequest = { numOfBlocks: number }
export type GetFeesResponse = {
  startBlock: number
  endBlock: number
  p25: number | null
  p50: number | null
  p75: number | null
}

export const GetFeesRequestSchema: yup.ObjectSchema<GetFeesRequest> = yup
  .object({
    numOfBlocks: yup.number().defined(),
  })
  .defined()

export const GetFeesResponseSchema: yup.ObjectSchema<GetFeesResponse> = yup
  .object({
    startBlock: yup.number().defined(),
    endBlock: yup.number().defined(),
    p25: yup.number().nullable().defined(),
    p50: yup.number().nullable().defined(),
    p75: yup.number().nullable().defined(),
  })
  .defined()

router.register<typeof GetFeesRequestSchema, GetFeesResponse>(
  `${ApiNamespace.fees}/getFees`,
  GetFeesRequestSchema,
  async (request, node): Promise<void> => {
    const numOfBlocks = request.data.numOfBlocks

    Assert.isGreaterThan(
      node.chain.head.sequence,
      numOfBlocks,
      'numOfBlocks must be less than the current head sequence',
    )

    const latestBlockHeader = node.chain.latest
    let latestBlock = await node.chain.getBlock(latestBlockHeader.hash)
    Assert.isNotNull(latestBlock, 'No block found')

    const fees: number[] = []
    const endBlock = latestBlockHeader.sequence
    const startBlock = endBlock - numOfBlocks

    latestBlock.transactions.forEach((transaction) => {
      if (!transaction.isMinersFee()) {
        fees.push(Number(transaction.fee()))
      }
    })

    for (let i = 0; i < numOfBlocks; i++) {
      latestBlock = await node.chain.getBlock(latestBlock.header.previousBlockHash)
      Assert.isNotNull(latestBlock, 'No block found')

      latestBlock.transactions.forEach((transaction) => {
        if (!transaction.isMinersFee()) {
          fees.push(Number(transaction.fee()))
        }
      })
    }

    request.end({
      startBlock,
      endBlock,
      p25: percentile(fees, 25),
      p50: percentile(fees, 50),
      p75: percentile(fees, 75),
    })
  },
)
