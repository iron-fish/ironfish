/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { getBlockSize, writeBlock } from '../../../network/utils/block'
import { BlockchainUtils } from '../../../utils/blockchain'
import { ApiNamespace, router } from '../router'

const MAX_BLOCKS_PER_SNAPSHOT_CHUNK = 1000

export type SnapshotChainStreamRequest =
  | {
      start?: number | null
      stop?: number | null
      maxBlocksPerChunk?: number | null
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
      maxBlocksPerChunk: yup.number().nullable().optional(),
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
    const maxBlocksPerChunk = request.data?.maxBlocksPerChunk ?? MAX_BLOCKS_PER_SNAPSHOT_CHUNK

    request.stream({ start, stop })

    let blocks: Buffer[] = []

    for (let i = start; i <= stop; ++i) {
      const blockHeader = await node.chain.getHeaderAtSequence(i)
      if (blockHeader) {
        const block = await node.chain.getBlock(blockHeader)
        if (block) {
          const serializedBlock = node.chain.strategy.blockSerde.serialize(block)
          const bw = bufio.write(getBlockSize(serializedBlock))
          const blockBuffer = writeBlock(bw, serializedBlock).render()
          blocks.push(blockBuffer)

          if (blocks.length >= maxBlocksPerChunk) {
            const buffer = serializeChunk(blocks)
            blocks = []
            request.stream({ start, stop, seq: i, buffer })
          }
        }
      }
    }

    if (blocks.length) {
      const buffer = serializeChunk(blocks)
      request.stream({ start, stop, seq: stop, buffer })
    }

    request.end({ start, stop, seq: stop })
  },
)

function serializeChunk(blocks: Buffer[]): Buffer {
  let sizeOfBuffers = 0
  for (const block of blocks) {
    sizeOfBuffers += bufio.sizeVarBytes(block)
  }
  const totalSize = 8 + sizeOfBuffers

  const bw = bufio.write(totalSize)
  bw.writeU64(blocks.length)

  for (const block of blocks) {
    bw.writeVarBytes(block)
  }

  return bw.render()
}
