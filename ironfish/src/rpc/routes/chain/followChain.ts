/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { ChainProcessor } from '../../../chainProcessor'
import { Block, BlockHeader } from '../../../primitives'
import { BlockHashSerdeInstance } from '../../../serde'
import { GraffitiUtils, PromiseUtils } from '../../../utils'
import { ApiNamespace, router } from '../router'

export type FollowChainStreamRequest =
  | {
      head?: string | null
    }
  | undefined

export type FollowChainStreamResponse = {
  type: 'connected' | 'disconnected' | 'fork'
  head: {
    sequence: number
  }
  block: {
    hash: string
    sequence: number
    previous: string
    graffiti: string
    difficulty: string
    size: number
    timestamp: number
    work: string
    main: boolean
    transactions: Array<{
      hash: string
      size: number
      fee: number
      notes: Array<{ commitment: string }>
      spends: Array<{ nullifier: string }>
    }>
  }
}

export const FollowChainStreamRequestSchema: yup.ObjectSchema<FollowChainStreamRequest> = yup
  .object({
    head: yup.string().nullable().optional(),
  })
  .optional()

export const FollowChainStreamResponseSchema: yup.ObjectSchema<FollowChainStreamResponse> = yup
  .object({
    type: yup.string().oneOf(['connected', 'disconnected', 'fork']).defined(),
    head: yup
      .object({
        sequence: yup.number().defined(),
      })
      .defined(),
    block: yup
      .object({
        hash: yup.string().defined(),
        sequence: yup.number().defined(),
        previous: yup.string().defined(),
        timestamp: yup.number().defined(),
        graffiti: yup.string().defined(),
        size: yup.number().defined(),
        work: yup.string().defined(),
        main: yup.boolean().defined(),
        difficulty: yup.string().defined(),
        transactions: yup
          .array(
            yup
              .object({
                hash: yup.string().defined(),
                size: yup.number().defined(),
                fee: yup.number().defined(),
                notes: yup
                  .array(
                    yup
                      .object({
                        commitment: yup.string().defined(),
                      })
                      .defined(),
                  )
                  .defined(),
                spends: yup
                  .array(
                    yup
                      .object({
                        nullifier: yup.string().defined(),
                      })
                      .defined(),
                  )
                  .defined(),
              })
              .defined(),
          )
          .defined(),
      })
      .defined(),
  })
  .defined()

router.register<typeof FollowChainStreamRequestSchema, FollowChainStreamResponse>(
  `${ApiNamespace.chain}/followChainStream`,
  FollowChainStreamRequestSchema,
  async (request, node): Promise<void> => {
    const head = request.data?.head ? Buffer.from(request.data.head, 'hex') : null

    const processor = new ChainProcessor({
      chain: node.chain,
      logger: node.logger,
      head: head,
    })

    const send = async (block: Block, type: 'connected' | 'disconnected' | 'fork') => {
      const transactions = await Promise.all(
        block.transactions.map(async (transaction) => {
          return transaction.withReference(async () => {
            return {
              hash: BlockHashSerdeInstance.serialize(transaction.hash()),
              size: Buffer.from(
                JSON.stringify(node.strategy.transactionSerde.serialize(transaction)),
              ).byteLength,
              fee: Number(await transaction.fee()),
              notes: [...transaction.notes()].map((note) => ({
                commitment: note.merkleHash().toString('hex'),
              })),
              spends: [...transaction.spends()].map((spend) => ({
                nullifier: spend.nullifier.toString('hex'),
              })),
            }
          })
        }),
      )

      request.stream({
        type: type,
        head: {
          sequence: node.chain.head.sequence,
        },
        block: {
          hash: block.header.hash.toString('hex'),
          sequence: block.header.sequence,
          previous: block.header.previousBlockHash.toString('hex'),
          graffiti: GraffitiUtils.toHuman(block.header.graffiti),
          size: Buffer.from(JSON.stringify(node.strategy.blockSerde.serialize(block)))
            .byteLength,
          work: block.header.work.toString(),
          main: type === 'connected',
          timestamp: block.header.timestamp.valueOf(),
          difficulty: block.header.target.toDifficulty().toString(),
          transactions,
        },
      })
    }

    const onAdd = async (header: BlockHeader) => {
      const block = await node.chain.getBlock(header)
      Assert.isNotNull(block)
      await send(block, 'connected')
    }

    const onRemove = async (header: BlockHeader) => {
      const block = await node.chain.getBlock(header)
      Assert.isNotNull(block)
      await send(block, 'disconnected')
    }

    const onFork = async (block: Block) => {
      await send(block, 'fork')
    }

    processor.onAdd.on(onAdd)
    processor.onRemove.on(onRemove)
    node.chain.onForkBlock.on(onFork)
    const abortController = new AbortController()

    request.onClose.on(() => {
      abortController.abort()
      processor.onAdd.off(onAdd)
      processor.onRemove.off(onRemove)
      node.chain.onForkBlock.off(onFork)
    })

    while (!request.closed) {
      await processor.update({ signal: abortController.signal })
      await PromiseUtils.sleep(1000)
    }

    request.end()
  },
)
