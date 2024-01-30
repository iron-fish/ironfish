/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ThreadPoolHandler } from '@ironfish/rust-nodejs'
import { Assert } from '../assert'
import { Logger } from '../logger'
import { Meter } from '../metrics/meter'
import { FileUtils } from '../utils/file'
import { GraffitiUtils } from '../utils/graffiti'
import { PromiseUtils } from '../utils/promise'
import { isValidPublicAddress } from '../wallet/validator'
import { StratumClient } from './stratum/clients/client'
import { MINEABLE_BLOCK_HEADER_GRAFFITI_OFFSET } from './utils'

export class MiningPoolMiner {
  readonly hashRate: Meter
  readonly threadPool: ThreadPoolHandler
  readonly stratum: StratumClient
  readonly logger: Logger

  private started: boolean
  private stopPromise: Promise<void> | null
  private stopResolve: (() => void) | null

  private readonly publicAddress: string
  private readonly name: string | undefined

  graffiti: Buffer | null
  miningRequestId: number
  target: Buffer
  waiting: boolean

  constructor(options: {
    threadCount: number
    batchSize: number
    logger: Logger
    publicAddress: string
    stratum: StratumClient
    name?: string
  }) {
    this.logger = options.logger
    this.graffiti = null
    this.name = options.name
    this.publicAddress = options.publicAddress
    if (!isValidPublicAddress(this.publicAddress)) {
      throw new Error(`Invalid public address: ${this.publicAddress}`)
    }

    const threadCount = options.threadCount ?? 1
    this.threadPool = new ThreadPoolHandler(threadCount, options.batchSize, false, false, false)

    this.stratum = options.stratum
    this.stratum.onConnected.on(() => this.stratum.subscribe(this.publicAddress, this.name))
    this.stratum.onSubscribed.on((m) => this.setGraffiti(GraffitiUtils.fromString(m.graffiti)))
    this.stratum.onSetTarget.on((m) => this.setTarget(m.target))
    this.stratum.onNotify.on((m) =>
      this.newWork(m.miningRequestId, Buffer.from(m.header, 'hex')),
    )
    this.stratum.onWaitForWork.on(() => this.waitForWork())

    this.hashRate = new Meter()
    this.miningRequestId = 0
    this.target = Buffer.alloc(32, 0)
    this.stopPromise = null
    this.stopResolve = null
    this.started = false
    this.waiting = false
  }

  start(): void {
    if (this.started) {
      return
    }

    this.stopPromise = new Promise((r) => (this.stopResolve = r))
    this.started = true
    this.stratum.start()
    this.hashRate.start()

    void this.mine()
  }

  stop(): void {
    if (!this.started) {
      return
    }

    this.logger.debug('Stopping miner, goodbye')
    this.started = false
    this.stratum.stop()
    this.hashRate.stop()

    if (this.stopResolve) {
      this.stopResolve()
    }
  }

  async waitForStop(): Promise<void> {
    await this.stopPromise
  }

  setTarget(target: string): void {
    this.target = Buffer.from(target, 'hex')
  }

  setGraffiti(graffiti: Buffer): void {
    this.graffiti = graffiti
  }

  newWork(miningRequestId: number, header: Buffer): void {
    Assert.isNotNull(this.graffiti)

    this.logger.debug(
      `new work ${header
        .toString('hex')
        .slice(0, 50)}... ${miningRequestId} ${FileUtils.formatHashRate(
        this.hashRate.rate1s,
      )}/s`,
    )

    const headerBytes = Buffer.concat([header])
    headerBytes.set(this.graffiti, MINEABLE_BLOCK_HEADER_GRAFFITI_OFFSET)

    this.waiting = false
    this.threadPool.newWork(headerBytes, this.target, miningRequestId, false)
  }

  waitForWork(): void {
    this.waiting = true
    this.threadPool.pause()
  }

  async mine(): Promise<void> {
    while (this.started) {
      if (!this.stratum.isConnected()) {
        await PromiseUtils.sleep(500)
        continue
      }

      if (this.graffiti == null) {
        this.logger.info('Waiting for graffiti from pool...')
        await PromiseUtils.sleep(500)
        continue
      }

      const blockResult = this.threadPool.getFoundBlock()

      if (blockResult != null) {
        const { miningRequestId, randomness } = blockResult

        this.logger.info(
          `Found share: ${randomness} ${miningRequestId} ${FileUtils.formatHashRate(
            this.hashRate.rate1s,
          )}/s`,
        )

        this.stratum.submit(miningRequestId, randomness)
      }

      const hashRate = this.threadPool.getHashRateSubmission()
      this.hashRate.add(hashRate)

      await PromiseUtils.sleep(10)
    }

    this.hashRate.stop()
  }
}
