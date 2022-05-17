/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { BlockchainUtils } from '../../../utils/blockchain'
import { ApiNamespace, router } from '../router'

export type ExportMinedStreamRequest =
  | {
      blockHash?: string | null
      start?: number | null
      stop?: number | null
      forks?: boolean | null
    }
  | undefined

export type ExportMinedStreamResponse = {
  start?: number
  stop?: number
  sequence?: number
  block?: {
    hash: string
    minersFee: number
    sequence: number
    main: boolean
    account: string
  }
}

export const ExportMinedStreamRequestSchema: yup.ObjectSchema<ExportMinedStreamRequest> = yup
  .object({
    blockHash: yup.string().nullable().optional(),
    start: yup.number().nullable().optional(),
    stop: yup.number().nullable().optional(),
    forks: yup.boolean().nullable().optional(),
  })
  .optional()

export const ExportMinedStreamResponseSchema: yup.ObjectSchema<ExportMinedStreamResponse> = yup
  .object({
    start: yup.number().defined(),
    stop: yup.number().defined(),
    sequence: yup.number().defined(),
    block: yup
      .object({
        hash: yup.string().defined(),
        minersFee: yup.number().defined(),
        sequence: yup.number().defined(),
        main: yup.boolean().defined(),
        account: yup.string().defined(),
      })
      .defined(),
  })
  .defined()

router.register<typeof ExportMinedStreamRequestSchema, ExportMinedStreamResponse>(
  `${ApiNamespace.miner}/exportMinedStream`,
  ExportMinedStreamRequestSchema,
  async (request, node): Promise<void> => {
    Assert.isNotNull(node.chain.head, 'head')
    Assert.isNotNull(node.chain.latest, 'latest')

    const blockHash = request.data?.blockHash ?? undefined

    if (blockHash) {
      const block = await node.minedBlocksIndexer.getMinedBlock(Buffer.from(blockHash, 'hex'))
      request.stream({ block })
      request.end()
    }

    const scanForks = request.data?.forks == null ? false : true
    const { start, stop } = BlockchainUtils.getBlockRange(node.chain, {
      start: request.data?.start,
      stop: request.data?.stop,
    })
    request.stream({ start, stop, sequence: 0 })

    for await (const block of node.minedBlocksIndexer.getMinedBlocks({
      scanForks,
      start,
      stop,
    })) {
      request.stream({
        start,
        stop,
        sequence: block.sequence,
        block,
      })
    }

    request.end()
  },
)
