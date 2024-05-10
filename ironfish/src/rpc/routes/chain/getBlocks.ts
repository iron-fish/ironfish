/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { Blockchain } from '../../../blockchain'
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { getBlockSize } from '../../../network/utils/serializers'
import { FullNode } from '../../../node'
import { BlockchainUtils } from '../../../utils/blockchain'
import { RpcNotFoundError, RpcValidationError } from '../../adapters'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { RpcBlock, RpcBlockSchema, serializeRpcBlockHeader } from '../types'
import { RpcTransaction } from './types'
import { serializeRpcTransaction } from './utils'

export type GetBlocksRequest = {
  /**
   * The starting block sequence (inclusive). Negative numbers start from the end of the chain (with 0 being the latest block).
   */
  start: number
  /**
   * The ending block sequence (inclusive). If past the end of the chain, will return at most the latest block.
   */
  end: number
  /**
   * Additionally return block transactions in serialized format.
   */
  serialized?: boolean
}

export type GetBlocksResponse = {
  blocks: { block: RpcBlock }[]
}

export const GetBlocksRequestSchema: yup.ObjectSchema<GetBlocksRequest> = yup
  .object()
  .shape({
    start: yup.number().defined(),
    end: yup.number().defined(),
    serialized: yup.boolean().optional(),
  })
  .defined()

export const GetBlocksResponseSchema: yup.ObjectSchema<GetBlocksResponse> = yup
  .object({
    blocks: yup
      .array(
        yup
          .object({
            block: RpcBlockSchema.defined(),
          })
          .defined(),
      )
      .defined(),
  })
  .defined()

routes.register<typeof GetBlocksRequestSchema, GetBlocksResponse>(
  `${ApiNamespace.chain}/getBlocks`,
  GetBlocksRequestSchema,
  async (request, context): Promise<void> => {
    Assert.isInstanceOf(context, FullNode)

    if (request.data.end < request.data.start) {
      throw new RpcValidationError(`end must be greater than or equal to start`)
    }

    const { start, stop: end } = BlockchainUtils.getBlockRange(context.chain, {
      start: request.data.start,
      stop: request.data.end,
    })

    const blocks: { block: RpcBlock }[] = []
    for (let seq = start; seq <= end; seq++) {
      const block = await getBlockAtSequence(context.chain, seq, request.data.serialized)
      blocks.push({ block: block })
    }

    request.end({ blocks })
  },
)

const getBlockAtSequence = async (
  chain: Blockchain,
  sequence: number,
  serialized?: boolean,
): Promise<RpcBlock> => {
  const header = await chain.getHeaderAtSequence(sequence)
  let error = ''
  if (!header) {
    error = `No block found with sequence ${sequence}`
    throw new RpcNotFoundError(error)
  }

  if (header.noteSize === null) {
    throw new RpcValidationError('Block header was saved to database without a note size')
  }

  const block = await chain.getBlock(header)
  if (!block) {
    throw new RpcNotFoundError(`No block with header ${header.hash.toString('hex')}`)
  }

  const transactions: RpcTransaction[] = []

  for (const tx of block.transactions) {
    transactions.push(serializeRpcTransaction(tx, serialized))
  }
  const blockHeaderResponse = serializeRpcBlockHeader(header)
  return {
    ...blockHeaderResponse,
    size: getBlockSize(block),
    transactions,
  }
}
