/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { v4 as uuid } from 'uuid'
import { Account } from '../account'
import { Blockchain } from '../blockchain'
import { Event } from '../event'
import { createRootLogger, Logger } from '../logger'
import { MemPool } from '../memPool'
import { Strategy } from '../strategy'

type Miner = {
  id: number
  name: string
  token: string
  active: boolean
  jobs: MinerJob[]
  onRemoved: Event<[]>
  onJob: Event<[MinerJob]>
}

export type MinerJob = {
  id: number
  bytes: string
  random: string
  randomMax: string
  target: string
  flush: boolean
}

export class MinerDirector {
  readonly chain: Blockchain
  readonly memPool: MemPool
  readonly logger: Logger
  readonly rewardTo: Account | null = null
  readonly miners = new Map<number, Miner>()

  started = false
  mining = false
  submittedBlocks = 0
  graffiti: string | null = null
  private lastMinerId = 0

  constructor(options: {
    chain: Blockchain
    memPool: MemPool
    strategy: Strategy
    logger?: Logger
    account?: Account
    graffiti?: string
    force?: boolean
  }) {
    this.chain = options.chain
    this.memPool = options.memPool
    this.logger = options.logger || createRootLogger()
    this.graffiti = options.graffiti ?? null
  }

  start(): void {
    this.started = true
  }

  stop(): void {
    this.started = false
  }

  startMining(): void {
    this.mining = true
  }

  stopMining(): void {
    this.mining = false
  }

  getMiner(id: number, token: string): Miner | null {
    const miner = this.miners.get(id)

    if (!miner || miner.token !== token) {
      return null
    }

    return miner
  }

  requestWork(miner: Miner): void {
    this.logger.debug(`${miner.name} is requesting work`)

  }

  connectMiner(options?: { name?: string }): Miner {
    const id = ++this.lastMinerId

    const miner = {
      id: id,
      name: options?.name?.trim() || `Miner ${id}`,
      token: uuid(),
      active: true,
      jobs: [],
      onRemoved: new Event<[]>(),
      onJob: new Event<[MinerJob]>(),
    }

    this.miners.set(miner.id, miner)
    return miner
  }

  disconnectMiner(miner: Miner): void {
    const existing = this.miners.get(miner.id)

    if (!existing) {
      return
    }

    miner.active = false
    this.miners.delete(miner.id)
  }
}
