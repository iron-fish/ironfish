/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { readBlock } from '../../../network/utils/block'
import { IronfishNode } from '../../../node'
import { Block } from '../../../primitives'
import { ApiNamespace, router } from '../router'

export type ImportSnapshotRequest =
  | {
      chunkStart?: number | null
      chunkEnd?: number | null
      blocks?: Buffer | null
    }
  | undefined

export type ImportSnapshotResponse = {
  headSeq: number
}

export const ImportSnapshotRequestSchema: yup.ObjectSchema<ImportSnapshotRequest> = yup
  .object({
    chunkStart: yup.number().nullable().optional(),
    chunkEnd: yup.number().nullable().optional(),
    blocks: yup.mixed<Buffer>().nullable().optional(),
  })
  .optional()

export const ImportSnapshotResponseSchema: yup.ObjectSchema<ImportSnapshotResponse> = yup
  .object({
    headSeq: yup.number().defined(),
  })
  .defined()

router.register<typeof ImportSnapshotRequestSchema, ImportSnapshotResponse>(
  `${ApiNamespace.chain}/importSnapshot`,
  ImportSnapshotRequestSchema,
  async (request, node): Promise<void> => {
    Assert.isNotNull(node.chain.head, 'head')
    Assert.isNotNull(node.chain.latest, 'latest')

    if (!request.data?.blocks) {
      request.end({ headSeq: node.chain.head.sequence })
    }

    const blocks = request.data?.blocks
    if (blocks) {
      const reader = bufio.read(blocks, true)
      const deserializedBlocks = deserializeChunk(node, reader)

      for (const block of deserializedBlocks) {
        const present = await node.chain.hasBlock(block.header.hash)
        if (!present) {
          const result = await node.chain.addBlock(block)
          if (!result.isAdded && result.reason) {
            node.logger.debug(
              `Could not add block ${block.header.sequence} from snapshot, reason: ${result.reason}`,
            )
          }
        }
      }

      request.end({ headSeq: node.chain.head.sequence })
    }
  },
)

function deserializeChunk(node: IronfishNode, reader: bufio.BufferReader): Block[] {
  const blocks: Block[] = []
  const blocksLength = reader.readU64()
  for (let i = 0; i < blocksLength; i++) {
    const blockReader = bufio.read(reader.readVarBytes(), true)
    const serializedBlock = readBlock(blockReader)
    const block = node.chain.strategy.blockSerde.deserialize(serializedBlock)
    blocks.push(block)
  }

  return blocks
}
