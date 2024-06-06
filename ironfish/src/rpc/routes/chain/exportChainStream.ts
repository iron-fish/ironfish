/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { BlockchainUtils } from '../../../utils/blockchain'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { serializeRpcBlockHeader } from './serializers'
import { RpcBlockHeader, RpcBlockHeaderSchema } from './types'

export type ExportChainStreamRequest =
  | {
      start?: number | null
      stop?: number | null
    }
  | undefined

export type ExportChainStreamResponse = {
  start: number
  stop: number
  block?: RpcBlockHeader & {
    main: boolean
    head: boolean
    latest: boolean
    /**
     * @deprecated Please use sequence instead
     */
    seq: number
    /**
     * @deprecated Please use previousBlockHash instead
     */
    prev: string
  }
}

export const ExportChainStreamRequestSchema: yup.ObjectSchema<ExportChainStreamRequest> = yup
  .object({
    start: yup.number().nullable().optional(),
    stop: yup.number().nullable().optional(),
  })
  .optional()

export const ExportChainStreamResponseSchema: yup.ObjectSchema<ExportChainStreamResponse> = yup
  .object({
    start: yup.number().defined(),
    stop: yup.number().defined(),
    block: RpcBlockHeaderSchema.concat(
      yup
        .object({
          seq: yup.number().defined(),
          main: yup.boolean().defined(),
          prev: yup.string().defined(),
          head: yup.boolean().defined(),
          latest: yup.boolean().defined(),
        })
        .defined(),
    ).optional(),
  })
  .defined()

routes.register<typeof ExportChainStreamRequestSchema, ExportChainStreamResponse>(
  `${ApiNamespace.chain}/exportChainStream`,
  ExportChainStreamRequestSchema,
  async (request, node): Promise<void> => {
    Assert.isInstanceOf(node, FullNode)
    Assert.isNotNull(node.chain.head, 'head')
    Assert.isNotNull(node.chain.latest, 'latest')

    const { start, stop } = BlockchainUtils.getBlockRange(node.chain, {
      start: request.data?.start,
      stop: request.data?.stop,
    })

    request.stream({ start, stop })

    for (let i = start; i <= stop; ++i) {
      const blocks = await node.chain.getHeadersAtSequence(i)

      for (const block of blocks) {
        const isMain = await node.chain.isHeadChain(block)

        const blockResult = {
          ...serializeRpcBlockHeader(block),
          main: isMain,
          seq: block.sequence,
          prev: block.previousBlockHash.toString('hex'),
          head: block.hash.equals(node.chain.head.hash),
          latest: block.hash.equals(node.chain.latest.hash),
        }

        request.stream({ start, stop, block: blockResult })
      }
    }

    request.end()
  },
)
