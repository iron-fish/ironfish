/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { getBlockSize } from '../../../network/utils/serializers'
import { FullNode } from '../../../node'
import { BlockHeader } from '../../../primitives'
import { GENESIS_BLOCK_SEQUENCE } from '../../../primitives/block'
import { RpcNotFoundError, RpcValidationError } from '../../adapters'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { serializeRpcBlockHeader, serializeRpcTransaction } from './serializers'
import { RpcBlock, RpcBlockSchema } from './types'

export type GetBlockRequest = {
  search?: string
  hash?: string
  sequence?: number
  confirmations?: number
  serialized?: boolean
}

export type GetBlockResponse = {
  block: RpcBlock
  metadata: {
    main: boolean
    confirmed: boolean
  }
}

export const GetBlockRequestSchema: yup.ObjectSchema<GetBlockRequest> = yup
  .object()
  .shape({
    search: yup.string(),
    hash: yup.string(),
    sequence: yup.number(),
    confirmations: yup.number().min(0).optional(),
    serialized: yup.boolean().optional(),
  })
  .defined()

export const GetBlockResponseSchema: yup.ObjectSchema<GetBlockResponse> = yup
  .object({
    block: RpcBlockSchema.defined(),
    metadata: yup
      .object({
        main: yup.boolean().defined(),
        confirmed: yup.boolean().defined(),
      })
      .defined(),
  })
  .defined()

routes.register<typeof GetBlockRequestSchema, GetBlockResponse>(
  `${ApiNamespace.chain}/getBlock`,
  GetBlockRequestSchema,
  async (request, context): Promise<void> => {
    Assert.isInstanceOf(context, FullNode)

    let header: BlockHeader | null = null
    let error = ''

    const confirmations = request.data.confirmations ?? context.config.get('confirmations')

    if (request.data.search) {
      const search = request.data.search.trim()
      const num = Number(search)

      if (Number.isInteger(num)) {
        request.data.sequence = num
      } else {
        request.data.hash = search
      }
    }

    // Use negative numbers to start from the head of the chain
    if (request.data.sequence && request.data.sequence < 0) {
      request.data.sequence = Math.max(
        context.chain.head.sequence + request.data.sequence + 1,
        GENESIS_BLOCK_SEQUENCE,
      )
    }

    if (request.data.hash) {
      const hash = Buffer.from(request.data.hash, 'hex')
      header = await context.chain.getHeader(hash)
      error = `No block found with hash ${request.data.hash}`
    }

    if (request.data.sequence && !header) {
      header = await context.chain.getHeaderAtSequence(request.data.sequence)
      error = `No block found with sequence ${request.data.sequence}`
    }

    if (!header) {
      throw new RpcNotFoundError(error)
    }

    if (header.noteSize === null) {
      throw new RpcValidationError('Block header was saved to database without a note size')
    }

    const block = await context.chain.getBlock(header)
    if (!block) {
      throw new RpcNotFoundError(`No block with header ${header.hash.toString('hex')}`)
    }

    const transactions: GetBlockResponse['block']['transactions'] = []

    for (const tx of block.transactions) {
      transactions.push(serializeRpcTransaction(tx, request.data.serialized))
    }

    const main = await context.chain.isHeadChain(header)
    const confirmed = context.chain.head.sequence - header.sequence >= confirmations

    const blockHeaderResponse = serializeRpcBlockHeader(header)

    request.end({
      block: {
        ...blockHeaderResponse,
        size: getBlockSize(block),
        transactions,
      },
      metadata: {
        main: main,
        confirmed: confirmed,
      },
    })
  },
)
