/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { getBlockSize } from '../../../network/utils/serializers'
import { FullNode } from '../../../node'
import { GENESIS_BLOCK_SEQUENCE } from '../../../primitives/block'
import { RpcNotFoundError, RpcValidationError } from '../../adapters'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { RpcBlock, RpcBlockSchema, serializeRpcBlockHeader } from '../types'
import { RpcTransaction } from './types'
import { serializeRpcTransaction } from './utils'

export type GetBlocksRequest = {
  /**
   * The starting block sequence (inclusive).
   */
  start: number
  /**
   * The ending block sequence (inclusive).
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

    // Use negative numbers to start from the genesis block of the chain
    if (request.data.start <= 0) {
      request.data.start = Math.max(request.data.start, GENESIS_BLOCK_SEQUENCE)
    }

    const blocks: { block: RpcBlock }[] = []
    for (let seq = request.data.start; seq <= request.data.end; seq++) {
      const block = await getBlockWithSequence(context, seq, request.data.serialized)
      blocks.push({ block: block })
    }

    request.end({ blocks })
  },
)

const getBlockWithSequence = async (
  node: FullNode,
  sequence: number,
  serialized?: boolean,
): Promise<RpcBlock> => {
  const header = await node.chain.getHeaderAtSequence(sequence)
  let error = ''
  if (!header) {
    error = `No block found with sequence ${sequence}`
    throw new RpcNotFoundError(error)
  }

  if (header.noteSize === null) {
    throw new RpcValidationError('Block header was saved to database without a note size')
  }

  const block = await node.chain.getBlock(header)
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
