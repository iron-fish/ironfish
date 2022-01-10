/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { BlockchainUtils } from '../../../utils/blockchain'
import { ApiNamespace, router } from '../router'

export type ExportChainStreamRequest =
  | {
      start?: number | null
      stop?: number | null
    }
  | undefined

export type ExportChainStreamResponse = {
  start: number
  stop: number
  block?: {
    hash: string
    seq: number
    prev: string
    main: boolean
    graffiti: string
    timestamp: number
    work: string
    difficulty: string
    head: boolean
    latest: boolean
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
    block: yup
      .object({
        hash: yup.string().defined(),
        seq: yup.number().defined(),
        prev: yup.string().defined(),
        main: yup.boolean().defined(),
        graffiti: yup.string().defined(),
        timestamp: yup.number().defined(),
        work: yup.string().defined(),
        difficulty: yup.string().defined(),
        head: yup.boolean().defined(),
        latest: yup.boolean().defined(),
      })
      .optional(),
  })
  .defined()

router.register<typeof ExportChainStreamRequestSchema, ExportChainStreamResponse>(
  `${ApiNamespace.chain}/exportChainStream`,
  ExportChainStreamRequestSchema,
  async (request, node): Promise<void> => {
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

        const result = {
          main: isMain,
          hash: block.hash.toString('hex'),
          seq: block.sequence,
          prev: block.previousBlockHash.toString('hex'),
          graffiti: block.graffiti.toString('ascii'),
          timestamp: block.timestamp.getTime(),
          work: block.work.toString(),
          difficulty: block.target.toDifficulty().toString(),
          head: block.hash.equals(node.chain.head.hash),
          latest: block.hash.equals(node.chain.latest.hash),
        }

        request.stream({ start, stop, block: result })
      }
    }

    request.end()
  },
)
