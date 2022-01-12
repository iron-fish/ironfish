/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Blockchain } from './blockchain'
import { Event } from './event'
import { createRootLogger, Logger } from './logger'
import { BlockHeader } from './primitives'

/**
 * This is used to get a non synchronous chain of block events from the blockchain
 * As blocks are added and removed, this system will call onAdd() and onRemove() in
 * a guaranteed correct order. If you have this chain:
 *      G -> A1
 *
 * You'll get
 *  - onAdd(G)
 *  - onAdd(A1)
 *
 * If you then reorg and have recived
 *      G -> A1
 *        -> B1 -> B2
 *
 * - onAdd(G)
 * - onAdd(A1)
 * - onRemove(A1)
 * - onAdd(B1)
 * - onAdd(B2)
 */
export class ChainProcessor {
  chain: Blockchain
  name: string | null
  hash: Buffer | null = null
  logger: Logger
  onAdd = new Event<[block: BlockHeader]>()
  onRemove = new Event<[block: BlockHeader]>()

  constructor(options: {
    name?: string
    logger?: Logger
    chain: Blockchain
    head: Buffer | null
  }) {
    this.chain = options.chain
    this.name = options.name ?? null
    this.logger = options.logger ?? createRootLogger()
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

    // Freeze this value in case it changes while were updating the head
    const chainHead = this.chain.head

    if (chainHead.hash.equals(this.hash)) {
      return
    }

    const head = await this.chain.getHeader(this.hash)
    if (!head) {
      return
    }

    const { fork, isLinear } = await this.chain.findFork(head, chainHead)
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

    const iter = this.chain.iterateTo(fork, chainHead, undefined, false)

    for await (const add of iter) {
      if (add.hash.equals(fork.hash)) {
        continue
      }

      await this.add(add)
      this.hash = add.hash
    }
  }
}
