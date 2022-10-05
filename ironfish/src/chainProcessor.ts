/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { Blockchain } from './blockchain'
import type { BlockHeader } from './primitives'
import { Assert } from './assert'
import { Event } from './event'
import { createRootLogger, Logger } from './logger'

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
 * If you then reorg and have received
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
  head: BlockHeader | null = null
  hash: Buffer | null = null
  logger: Logger
  onAdd = new Event<[block: BlockHeader]>()
  onRemove = new Event<[block: BlockHeader]>()

  constructor(options: { logger?: Logger; chain: Blockchain; head: BlockHeader | null }) {
    this.chain = options.chain
    this.logger = (options.logger ?? createRootLogger()).withTag('chainprocessor')
    this.head = options.head
  }

  private async add(header: BlockHeader): Promise<void> {
    await this.onAdd.emitAsync(header)
  }

  private async remove(header: BlockHeader): Promise<void> {
    await this.onRemove.emitAsync(header)
  }

  async update({ signal }: { signal?: AbortSignal } = {}): Promise<{ hashChanged: boolean }> {
    const oldHead = this.head

    if (!this.head) {
      await this.add(this.chain.genesis)
      this.head = this.chain.genesis
    }

    // Freeze this value in case it changes while we're updating the head
    const chainHead = this.chain.head
    const accountHead = this.head

    if (chainHead.hash.equals(accountHead.hash)) {
      return { hashChanged: false }
    }

    const { fork, isLinear } = await this.chain.findFork(accountHead, chainHead)
    if (!fork) {
      return { hashChanged: false }
    }

    if (!isLinear) {
      const iter = this.chain.iterateFrom(accountHead, fork, undefined, false)

      for await (const remove of iter) {
        if (signal?.aborted) {
          return { hashChanged: !oldHead || !this.head.hash.equals(oldHead.hash) }
        }

        if (remove.hash.equals(fork.hash)) {
          continue
        }

        const prev = await this.chain.getPrevious(remove)
        Assert.isNotNull(prev)

        await this.remove(remove)
        this.head = prev
      }
    }

    const iter = this.chain.iterateTo(fork, chainHead, undefined, false)

    for await (const add of iter) {
      if (signal?.aborted) {
        return { hashChanged: !oldHead || !this.head.hash.equals(oldHead.hash) }
      }

      if (add.hash.equals(fork.hash)) {
        continue
      }

      await this.add(add)
      this.head = add
    }

    return { hashChanged: !oldHead || !this.head.hash.equals(oldHead.hash) }
  }
}
