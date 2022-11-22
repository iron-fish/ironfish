/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { RpcBlockHeader, SetIntervalToken } from '@ironfish/sdk'
import LRU from 'blru'

export type GossipFork = {
  header: RpcBlockHeader
  timestamp: number
  ageSequence: number
  age: number
}

export class GossipForkCounter {
  private heads = new LRU<
    string,
    { header: RpcBlockHeader; timestamp: number; ageSequence: number; old?: boolean }
  >(5000, null, Map)

  private tickInterval: SetIntervalToken | null = null
  private delay: number
  private active: Array<GossipFork> = []
  private staleThreshold: number

  constructor(targetBlockTimeInSeconds: number, options?: { delayMs?: number }) {
    this.delay = options?.delayMs ?? 1000
    this.staleThreshold = targetBlockTimeInSeconds * 3 * 1000
  }

  start(): void {
    this.tickInterval = setInterval(() => this.tick(), this.delay)
  }

  stop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval)
    }
  }

  private tick(): void {
    const now = Date.now()
    const active: GossipFork[] = []

    const values = [...this.heads.values()].sort(
      (a, b) => b.header.sequence - a.header.sequence,
    )

    for (const { header, timestamp, ageSequence, old } of values) {
      const age = now - timestamp

      if (age >= this.staleThreshold) {
        continue
      }

      if (old) {
        continue
      }

      active.push({
        header,
        timestamp,
        ageSequence,
        age,
      })
    }

    this.active = active
  }

  get latest(): GossipFork | null {
    return this.active[0] ?? null
  }

  get count(): number {
    return this.active.length
  }

  get forks(): ReadonlyArray<GossipFork> {
    return this.active
  }

  add(header: RpcBlockHeader): void {
    const prev = this.heads.get(header.previousBlockHash)
    const ageSequence = prev ? prev.ageSequence + 1 : 0

    if (prev) {
      prev.old = true
      this.heads.set(header.previousBlockHash, prev)
    }

    this.heads.set(header.hash, {
      header: header,
      timestamp: Date.now(),
      ageSequence,
    })
  }
}
