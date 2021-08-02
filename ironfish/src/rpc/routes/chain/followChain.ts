/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Blockchain } from '../../../blockchain'
import { Event } from '../../../event'
import { Logger } from '../../../logger'
import { Block, BlockHeader } from '../../../primitives'
import { GraffitiUtils } from '../../../utils/graffiti'
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
    timestamp: number
    work: string
    main: boolean
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
        work: yup.string().defined(),
        main: yup.boolean().defined(),
        difficulty: yup.string().defined(),
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
      name: 'FollowChain',
      head: head,
    })

    const send = (header: BlockHeader, type: 'connected' | 'disconnected' | 'fork') => {
      request.stream({
        type: type,
        head: {
          sequence: node.chain.head.sequence,
        },
        block: {
          hash: header.hash.toString('hex'),
          sequence: header.sequence,
          previous: header.previousBlockHash.toString('hex'),
          graffiti: GraffitiUtils.toHuman(header.graffiti),
          work: header.work.toString(),
          main: type === 'connected',
          timestamp: header.timestamp.valueOf(),
          difficulty: header.target.toDifficulty().toString(),
        },
      })
    }

    const onAdd = (header: BlockHeader) => {
      send(header, 'connected')
    }

    const onRemove = (header: BlockHeader) => {
      send(header, 'disconnected')
    }

    const onFork = (block: Block) => {
      send(block.header, 'fork')
    }

    processor.onAdd.on(onAdd)
    processor.onRemove.on(onRemove)
    node.chain.onForkBlock.on(onFork)

    request.onClose.on(() => {
      processor.onAdd.off(onAdd)
      processor.onRemove.off(onRemove)
      node.chain.onForkBlock.off(onFork)
    })

    while (!request.closed) {
      await processor.update()
    }

    request.end()
  },
)

class ChainProcessor {
  chain: Blockchain
  name: string
  hash: Buffer | null = null
  logger: Logger
  onAdd = new Event<[block: BlockHeader]>()
  onRemove = new Event<[block: BlockHeader]>()

  constructor(options: {
    name: string
    logger: Logger
    chain: Blockchain
    head: Buffer | null
  }) {
    this.chain = options.chain
    this.name = options.name
    this.logger = options.logger
    this.hash = options.head
  }

  async add(header: BlockHeader): Promise<void> {
    await this.onAdd.emitAsync(header)
  }

  async remove(header: BlockHeader): Promise<void> {
    await this.onRemove.emitAsync(header)
  }

  async update(): Promise<void> {
    if (!this.hash) {
      await this.add(this.chain.genesis)
      this.hash = this.chain.genesis.hash
    }

    const head = await this.chain.getHeader(this.hash)
    if (!head || this.chain.head.hash.equals(head.hash)) {
      return
    }

    const { fork, isLinear } = await this.chain.findFork(head, this.chain.head)
    if (!fork) {
      return
    }

    if (!isLinear) {
      const iter = this.chain.iterateFrom(head, fork, undefined, false)

      for await (const remove of iter) {
        if (!remove.hash.equals(fork.hash)) {
          await this.remove(remove)
        }

        this.hash = remove.hash
      }
    }

    const iter = this.chain.iterateTo(fork, this.chain.head, undefined, false)

    for await (const add of iter) {
      if (add.hash.equals(fork.hash)) {
        continue
      }

      await this.add(add)
      this.hash = add.hash
    }
  }
}
