/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { Blockchain } from './blockchain'
import type { BlockHeader } from './primitives'
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
  // TODO: Consider refactoring to store a BlockHeader rather than a hash + sequence
  hash: Buffer | null = null
  sequence: number | null = null
  logger: Logger
  onAdd = new Event<[block: BlockHeader]>()
  onRemove = new Event<[block: BlockHeader]>()
  maxQueueSize: number | null

  constructor(options: {
    logger?: Logger
    chain: Blockchain
    head: Buffer | null
    maxQueueSize?: number | null
  }) {
    this.chain = options.chain
    this.logger = (options.logger ?? createRootLogger()).withTag('chainprocessor')
    this.hash = options.head
    this.maxQueueSize = options.maxQueueSize ?? null
  }

  private async add(header: BlockHeader): Promise<void> {
    await this.onAdd.emitAsync(header)
  }

  private async remove(header: BlockHeader): Promise<void> {
    await this.onRemove.emitAsync(header)
  }

  async update({ signal }: { signal?: AbortSignal } = {}): Promise<{ hashChanged: boolean }> {
    if (!this.hash) {
      await this.add(this.chain.genesis)
      this.hash = this.chain.genesis.hash
      this.sequence = this.chain.genesis.sequence
    }

    // Freeze this value in case it changes while we're updating the head
    const chainHead = this.chain.head

    if (chainHead.hash.equals(this.hash)) {
      return { hashChanged: false }
    }

    const head = await this.chain.getHeader(this.hash)

    let blockCount = 0
    let hashChanged = false

    if (!head) {
      this.logger.warn('ChainProcessor could not find head in blockchain.')
      return { hashChanged }
    }

    const fork = await this.chain.findFork(head, chainHead)

    // All cases can be handled by rewinding to the fork point
    // and then fast-forwarding to the destination. In cases where `head` and `chainHead`
    // are on the same linear chain, either rewind or fast-forward will just be a no-op
    const iterBackwards = this.chain.iterateFrom(head, fork, undefined, false)

    for await (const remove of iterBackwards) {
      if (signal?.aborted) {
        return { hashChanged }
      }

      if (remove.hash.equals(fork.hash)) {
        continue
      }

      await this.remove(remove)
      this.hash = remove.previousBlockHash
      this.sequence = remove.sequence - 1
      hashChanged = true
      blockCount++

      if (this.maxQueueSize && blockCount >= this.maxQueueSize) {
        return { hashChanged }
      }
    }

    const iterForwards = this.chain.iterateTo(fork, chainHead, undefined, false)

    for await (const add of iterForwards) {
      if (signal?.aborted) {
        return { hashChanged }
      }

      if (add.hash.equals(fork.hash)) {
        continue
      }

      await this.add(add)
      this.hash = add.hash
      this.sequence = add.sequence
      hashChanged = true
      blockCount++

      if (this.maxQueueSize && blockCount >= this.maxQueueSize) {
        return { hashChanged }
      }
    }

    return { hashChanged }
  }
}
