/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ThreadPoolHandler } from 'ironfish-rust-nodejs'
import { createRootLogger, Logger } from '../logger'
import { Meter } from '../metrics/meter'
import { FileUtils } from '../utils/file'
import { PromiseUtils } from '../utils/promise'
import { StratumClient } from './stratum/stratumClient'

// TODO: Once this is started via CLI, we can probably use that to listen for graffiti changes, etc.
// TODO: Handle disconnects, etc.
export class MiningPoolMiner {
  // TODO: Send hash rate up to pool
  readonly hashRate: Meter
  readonly threadPool: ThreadPoolHandler
  readonly stratum: StratumClient
  readonly logger: Logger

  private started: boolean
  private stopPromise: Promise<void> | null
  private stopResolve: (() => void) | null

  // TODO: Think about best way to store data at each level, miner, pool, server, client
  graffiti: Buffer
  miningRequestId: number
  // TODO: LRU
  miningRequestPayloads: { [index: number]: Buffer } = {}
  target: Buffer

  constructor(options: {
    threadCount: number
    batchSize: number
    logger?: Logger
    graffiti: Buffer
  }) {
    this.logger = options.logger ?? createRootLogger()
    this.graffiti = options.graffiti

    const threadCount = options.threadCount ?? 1
    this.threadPool = new ThreadPoolHandler(threadCount, options.batchSize)

    this.stratum = new StratumClient({
      miner: this,
      graffiti: this.graffiti,
      host: 'localhost',
      port: 1234,
    })

    this.hashRate = new Meter()
    this.miningRequestId = 0
    this.target = Buffer.alloc(32)
    this.target.writeUInt32BE(65535)
    this.stopPromise = null
    this.stopResolve = null
    this.started = false
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

  newWork(miningRequestId: number, headerHex: string): void {
    this.logger.info('new work', this.target.toString('hex'), miningRequestId)
    this.miningRequestPayloads[miningRequestId] = Buffer.from(headerHex, 'hex')

    const headerBytes = Buffer.from(headerHex, 'hex')
    headerBytes.set(this.graffiti, 176)
    this.threadPool.newWork(headerBytes, this.target, miningRequestId)
  }

  async mine(): Promise<void> {
    // eslint-disable-next-line no-constant-condition
    while (this.started) {
      // TODO: Turn this into an AsyncGenerator type thing on the JS side?
      const blockResult = this.threadPool.getFoundBlock()

      if (blockResult != null) {
        const { miningRequestId, randomness } = blockResult

        this.logger.info(
          'Found block:',
          randomness,
          miningRequestId,
          `${FileUtils.formatHashRate(this.hashRate.rate1s)}/s`,
        )

        this.stratum.submit(miningRequestId, randomness, this.graffiti)
      }

      const hashRate = this.threadPool.getHashRateSubmission()
      this.hashRate.add(hashRate)

      await PromiseUtils.sleep(10)
    }

    this.hashRate.stop()
  }
}
