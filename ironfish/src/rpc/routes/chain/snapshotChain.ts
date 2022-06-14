/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { BlockchainUtils } from '../../../utils/blockchain'
import { ApiNamespace, router } from '../router'
import { BlockSerde } from '../../../primitives/block'
import { Transaction } from '../../../primitives/transaction'
import bufio from 'bufio'

export type SnapshotChainStreamRequest =
  | {
      start?: number | null
      stop?: number | null
    }
  | undefined

export type SnapshotChainStreamResponse = {
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

const TransactionSchema = yup.object().required()

export const SnapshotChainStreamRequestSchema: yup.ObjectSchema<SnapshotChainStreamRequest> = yup
  .object({
    start: yup.number().nullable().optional(),
    stop: yup.number().nullable().optional(),
  })
  .optional()

export const SnapshotChainStreamResponseSchema: yup.ObjectSchema<SnapshotChainStreamResponse> = yup
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
    transactions: yup.array().of(TransactionSchema).required(),
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
      const blockHeaders = await node.chain.getHeadersAtSequence(i)

      for (const blockHeader of blockHeaders) {
        const isMain = await node.chain.isHeadChain(blockHeader)
        const block = await node.chain.getBlock(blockHeader)
        let serializedBlock
        let transactions:Transaction[]
        if(block) {
          serializedBlock = node.chain.strategy.blockSerde.serialize(block)
          // console.log(serializedBlock)
          transactions = block.transactions
        } else {
          transactions = []
        }

        const dummyResult = {
          main: isMain,
          hash: blockHeader.hash.toString('hex'),
          seq: blockHeader.sequence,
          prev: blockHeader.previousBlockHash.toString('hex'),
          graffiti: blockHeader.graffiti.toString('ascii'),
          timestamp: blockHeader.timestamp.getTime(),
          work: blockHeader.work.toString(),
          difficulty: blockHeader.target.toDifficulty().toString(),
          head: blockHeader.hash.equals(node.chain.head.hash),
          latest: blockHeader.hash.equals(node.chain.latest.hash),
          transactions: transactions
        }

        request.stream({ start, stop, block: dummyResult })
      }
    }

    request.end()
  },
)
