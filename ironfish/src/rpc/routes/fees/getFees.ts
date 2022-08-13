/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { ApiNamespace, router } from '../router'

export type GetFeesRequest = { numOfBlocks: number }
export type GetFeesResponse = {
  startBlock: number
  endBlock: number
  p25: number
  p50: number
  p75: number
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
    p25: yup.number().defined(),
    p50: yup.number().defined(),
    p75: yup.number().defined(),
  })
  .defined()

const percentile = (fees: number[], percentile: number): number => {
  const pos = (fees.length - 1) * (percentile / 100)
  const base = Math.floor(pos)

  if (fees[base + 1]) {
    const remainder = pos - base
    return fees[base] + remainder * (fees[base + 1] - fees[base])
  } else {
    return fees[base]
  }
}

router.register<typeof GetFeesRequestSchema, GetFeesResponse>(
  `${ApiNamespace.fees}/getFees`,
  GetFeesRequestSchema,
  async (request, node): Promise<void> => {
    const numOfBlocks = request.data.numOfBlocks - 1

    Assert.isGreaterThan(
      node.chain.head.sequence,
      numOfBlocks,
      'numOfBlocks must be less than the current head sequence',
    )

    const fees: number[] = []
    const endBlock = node.chain.latest.sequence
    const startBlock = endBlock - numOfBlocks

    let nextBlockHash = node.chain.latest.hash

    for (let i = 0; i <= numOfBlocks; i++) {
      const latestBlock = await node.chain.getBlock(nextBlockHash)
      Assert.isNotNull(latestBlock, 'No block found')
      nextBlockHash = latestBlock.header.previousBlockHash

      latestBlock.transactions.forEach((transaction) => {
        if (!transaction.isMinersFee()) {
          fees.push(Number(transaction.fee()))
        }
      })
    }

    fees.sort((a, b) => a - b)

    request.end({
      startBlock,
      endBlock,
      p25: percentile(fees, 25),
      p50: percentile(fees, 50),
      p75: percentile(fees, 75),
    })
  },
)
