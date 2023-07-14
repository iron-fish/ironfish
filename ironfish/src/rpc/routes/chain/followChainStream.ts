/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { ChainProcessor } from '../../../chainProcessor'
import { getBlockSize, getTransactionSize } from '../../../network/utils/serializers'
import { IronfishNode } from '../../../node'
import { Block, BlockHeader } from '../../../primitives'
import { BlockHashSerdeInstance } from '../../../serde'
import { BufferUtils, PromiseUtils } from '../../../utils'
import { RpcRequest } from '../../request'

export type Request =
  | {
      head?: string | null
    }
  | undefined

export type Response = {
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
      expiration: number
      notes: Array<{ commitment: string }>
      spends: Array<{ nullifier: string }>
      mints: Array<{
        id: string
        metadata: string
        name: string
        owner: string
        value: string
      }>
      burns: Array<{
        id: string
        value: string
      }>
    }>
  }
}

export const RequestSchema: yup.ObjectSchema<Request> = yup
  .object({
    head: yup.string().nullable().optional(),
  })
  .optional()

export const ResponseSchema: yup.ObjectSchema<Response> = yup
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
                expiration: yup.number().defined(),
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
                mints: yup
                  .array(
                    yup
                      .object({
                        id: yup.string().defined(),
                        metadata: yup.string().defined(),
                        name: yup.string().defined(),
                        owner: yup.string().defined(),
                        value: yup.string().defined(),
                      })
                      .defined(),
                  )
                  .defined(),
                burns: yup
                  .array(
                    yup
                      .object({
                        id: yup.string().defined(),
                        value: yup.string().defined(),
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

export const route = 'followChainStream'
export const handle = async (
  request: RpcRequest<Request, Response>,
  node: IronfishNode,
): Promise<void> => {
  const head = request.data?.head ? Buffer.from(request.data.head, 'hex') : null

  const processor = new ChainProcessor({
    chain: node.chain,
    logger: node.logger,
    head: head,
  })

  const send = (block: Block, type: 'connected' | 'disconnected' | 'fork') => {
    const transactions = block.transactions.map((transaction) => {
      return transaction.withReference(() => {
        return {
          hash: BlockHashSerdeInstance.serialize(transaction.hash()),
          size: getTransactionSize(transaction),
          fee: Number(transaction.fee()),
          expiration: transaction.expiration(),
          notes: transaction.notes.map((note) => ({
            commitment: note.hash().toString('hex'),
          })),
          spends: transaction.spends.map((spend) => ({
            nullifier: spend.nullifier.toString('hex'),
          })),
          mints: transaction.mints.map((mint) => ({
            id: mint.asset.id().toString('hex'),
            metadata: BufferUtils.toHuman(mint.asset.metadata()),
            name: BufferUtils.toHuman(mint.asset.name()),
            owner: mint.asset.owner().toString('hex'),
            value: mint.value.toString(),
          })),
          burns: transaction.burns.map((burn) => ({
            id: burn.assetId.toString('hex'),
            value: burn.value.toString(),
          })),
        }
      })
    })

    request.stream({
      type: type,
      head: {
        sequence: node.chain.head.sequence,
      },
      block: {
        hash: block.header.hash.toString('hex'),
        sequence: block.header.sequence,
        previous: block.header.previousBlockHash.toString('hex'),
        graffiti: BufferUtils.toHuman(block.header.graffiti),
        size: getBlockSize(block),
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
}
