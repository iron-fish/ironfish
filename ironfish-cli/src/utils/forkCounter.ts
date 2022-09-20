/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { RpcBlockHeader, SetIntervalToken, TARGET_BLOCK_TIME_IN_SECONDS } from '@ironfish/sdk'

const STALE_THRESHOLD = TARGET_BLOCK_TIME_IN_SECONDS * 3 * 1000

export type GossipFork = {
  hash: string
  age: number
  graffiti: string
  mined: number
  sequenceDelta: number
}

export class GossipForkCounter {
  private heads = new Map<
    string,
    { header: RpcBlockHeader; time: number; mined: number; old?: boolean }
  >()

  private tickInterval: SetIntervalToken | null = null
  private delay: number
  private active: Array<GossipFork> = []

  constructor(options?: { delayMs?: number }) {
    this.delay = options?.delayMs ?? 1000
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

    let highest = 0
    for (const { header } of values) {
      highest = Math.max(highest, header.sequence)
    }

    for (const { header, time, mined, old } of values) {
      const age = now - time

      if (age >= STALE_THRESHOLD) {
        continue
      }

      if (old) {
        continue
      }

      active.push({
        hash: header.hash,
        age,
        graffiti: header.graffiti,
        mined,
        sequenceDelta: highest - header.sequence,
      })
    }

    this.active = active
  }

  get forksCount(): number {
    return this.active.length
  }

  get forks(): ReadonlyArray<GossipFork> {
    return this.active
  }

  count(header: RpcBlockHeader): void {
    const prev = this.heads.get(header.previousBlockHash)
    const mined = prev ? prev.mined + 1 : 0

    if (prev) {
      prev.old = true
      this.heads.set(header.previousBlockHash, prev)
    }

    this.heads.set(header.hash, {
      header: header,
      time: Date.now(),
      mined: mined,
    })
  }
}
