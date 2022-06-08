/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { getBlockSize, writeBlock } from '../../../network/utils/block'
import { BlockchainUtils } from '../../../utils/blockchain'
import { ApiNamespace, router } from '../router'

export type SnapshotChainStreamRequest =
  | {
      start?: number | null
      stop?: number | null
    }
  | undefined

export type SnapshotChainStreamResponse = {
  start: number
  stop: number
  seq?: number
  buffer?: Buffer
}

export const SnapshotChainStreamRequestSchema: yup.ObjectSchema<SnapshotChainStreamRequest> =
  yup
    .object({
      start: yup.number().nullable().optional(),
      stop: yup.number().nullable().optional(),
    })
    .optional()

export const SnapshotChainStreamResponseSchema: yup.ObjectSchema<SnapshotChainStreamResponse> =
  yup
    .object({
      start: yup.number().defined(),
      stop: yup.number().defined(),
      seq: yup.number().optional(),
      buffer: yup.mixed<Buffer>().optional(),
    })
    .defined()

router.register<typeof SnapshotChainStreamRequestSchema, SnapshotChainStreamResponse>(
  `${ApiNamespace.chain}/snapshotChainStream`,
  SnapshotChainStreamRequestSchema,
  async (request, node): Promise<void> => {
    Assert.isNotNull(node.chain.head, 'head')
    Assert.isNotNull(node.chain.latest, 'latest')

    const { start, stop } = BlockchainUtils.getBlockRange(node.chain, {
      start: request.data?.start,
      stop: request.data?.stop,
    })

    request.stream({ start, stop })

    for (let i = start; i <= stop; ++i) {
      const blockHeader = await node.chain.getHeaderAtSequence(i)
      if (blockHeader) {
        const block = await node.chain.getBlock(blockHeader)
        if (block) {
          const serializedBlock = node.chain.strategy.blockSerde.serialize(block)
          const bw = bufio.write(getBlockSize(serializedBlock))
          const buffer = writeBlock(bw, serializedBlock).render()
          request.stream({ start, stop, seq: i, buffer })
        }
      }
    }

    request.end()
  },
)
