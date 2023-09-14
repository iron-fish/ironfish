/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { ChainProcessor } from '../../../chainProcessor'
import { getBlockSize, getTransactionSize } from '../../../network/utils/serializers'
import { FullNode } from '../../../node'
import { Block, BlockHeader } from '../../../primitives'
import { BlockHashSerdeInstance } from '../../../serde'
import { BufferUtils, PromiseUtils } from '../../../utils'
import { RpcBlockHeader, RpcBlockHeaderSchema, serializeRpcBlockHeader } from '../../types'
import { ApiNamespace, routes } from '../router'
import { RpcTransaction, RpcTransactionSchema } from './types'

export type FollowChainStreamRequest =
  | {
      head?: string | null
      serialized?: boolean
      wait?: boolean
      limit?: number
    }
  | undefined

export type FollowChainStreamResponse = {
  type: 'connected' | 'disconnected' | 'fork'
  head: {
    sequence: number
  }
  block: RpcBlockHeader & {
    size: number
    work: string
    main: boolean
    transactions: RpcTransaction[]
  }
}

export const FollowChainStreamRequestSchema: yup.ObjectSchema<FollowChainStreamRequest> = yup
  .object({
    head: yup.string().nullable().optional(),
    serialized: yup.boolean().optional(),
    wait: yup.boolean().optional().default(true),
    limit: yup.number().optional(),
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
    block: RpcBlockHeaderSchema.concat(
      yup
        .object({
          main: yup.boolean().defined(),
          size: yup.number().defined(),
          work: yup.string().defined(),
          transactions: yup.array(RpcTransactionSchema).defined(),
        })
        .defined(),
    ).defined(),
  })
  .defined()

routes.register<typeof FollowChainStreamRequestSchema, FollowChainStreamResponse>(
  `${ApiNamespace.chain}/followChainStream`,
  FollowChainStreamRequestSchema,
  async (request, node): Promise<void> => {
    Assert.isInstanceOf(node, FullNode)
    const head = request.data?.head ? Buffer.from(request.data.head, 'hex') : null

    const processor = new ChainProcessor({
      chain: node.chain,
      logger: node.logger,
      head: head,
    })

    let streamed = 0

    const send = (block: Block, type: 'connected' | 'disconnected' | 'fork') => {
      const transactions = block.transactions.map((transaction) => ({
        ...(request.data?.serialized
          ? { serialized: transaction.serialize().toString('hex') }
          : {}),
        hash: BlockHashSerdeInstance.serialize(transaction.hash()),
        size: getTransactionSize(transaction),
        fee: Number(transaction.fee()),
        expiration: transaction.expiration(),
        notes: transaction.notes.map((note) => ({
          commitment: note.hash().toString('hex'),
          hash: note.hash().toString('hex'),
          serialized: note.serialize().toString('hex'),
        })),
        spends: transaction.spends.map((spend) => ({
          nullifier: spend.nullifier.toString('hex'),
          commitment: spend.commitment.toString('hex'),
          size: spend.size,
        })),
        mints: transaction.mints.map((mint) => ({
          id: mint.asset.id().toString('hex'),
          metadata: BufferUtils.toHuman(mint.asset.metadata()),
          name: BufferUtils.toHuman(mint.asset.name()),
          creator: mint.asset.creator().toString('hex'),
          value: mint.value.toString(),
          transferOwnershipTo: mint.transferOwnershipTo?.toString('hex'),
        })),
        burns: transaction.burns.map((burn) => ({
          id: burn.assetId.toString('hex'),
          value: burn.value.toString(),
        })),
      }))

      const blockHeaderResponse = serializeRpcBlockHeader(block.header)

      request.stream({
        type: type,
        head: {
          sequence: node.chain.head.sequence,
        },
        block: {
          ...blockHeaderResponse,
          size: getBlockSize(block),
          work: block.header.work.toString(),
          main: type === 'connected',
          transactions,
        },
      })

      if (request.data?.limit && ++streamed >= request.data.limit) {
        onClose()
        request.end()
      }
    }

    const onClose = () => {
      abortController.abort()
      processor.onAdd.clear()
      processor.onRemove.clear()
      node.chain.onForkBlock.clear()
    }

    const onAdd = async (header: BlockHeader) => {
      const block = await node.chain.getBlock(header)
      Assert.isNotNull(block)
      send(block, 'connected')
    }

    const onRemove = async (header: BlockHeader) => {
      const block = await node.chain.getBlock(header)
      Assert.isNotNull(block)
      send(block, 'disconnected')
    }

    const onFork = (block: Block) => {
      send(block, 'fork')
    }

    processor.onAdd.on(onAdd)
    processor.onRemove.on(onRemove)
    node.chain.onForkBlock.on(onFork)
    const abortController = new AbortController()

    request.onClose.on(onClose)

    while (!request.closed) {
      await processor.update({ signal: abortController.signal })

      if (!request.data?.wait) {
        onClose()
        request.end()
      }

      await PromiseUtils.sleep(1000)
    }

    request.end()
  },
)
