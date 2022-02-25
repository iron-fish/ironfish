/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ThreadPoolHandler } from 'ironfish-rust-nodejs'
import { createRootLogger, Logger } from '../logger'
import { Meter } from '../metrics/meter'
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

  // TODO: Think about best way to store data at each level, miner, pool, server, client
  graffiti: Buffer
  miningRequestId: number
  // TODO: LRU
  miningRequestPayloads: { [index: number]: Buffer } = {}
  target: Buffer

  private constructor(options: {
    threadPool: ThreadPoolHandler
    logger?: Logger
    graffiti: Buffer
  }) {
    this.threadPool = options.threadPool
    this.logger = options.logger ?? createRootLogger()
    this.graffiti = options.graffiti

    this.stratum = new StratumClient(this)
    this.stratum.start()
    this.hashRate = new Meter()
    this.miningRequestId = 0
    this.target = Buffer.alloc(32)
    this.target.writeUInt32BE(65535)
  }

  static init(options: { threadCount?: number; graffiti: Buffer }): MiningPoolMiner {
    const threadCount = options.threadCount ?? 1

    const threadPool = new ThreadPoolHandler(threadCount)

    return new MiningPoolMiner({ threadPool, graffiti: options.graffiti })
  }

  async mine(): Promise<void> {
    this.hashRate.start()
    this.stratum.subscribe(this.graffiti)

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // TODO: Turn this into an AsyncGenerator type thing on the JS side?
      const blockResult = this.threadPool.getFoundBlock()

      if (blockResult != null) {
        const { miningRequestId, randomness, blockHash } = blockResult
        this.logger.info('Found block:', randomness, miningRequestId, blockHash)
        this.stratum.submit(miningRequestId, randomness, this.graffiti)
      }

      const hashRate = this.threadPool.getHashRateSubmission()
      this.hashRate.add(hashRate)

      await PromiseUtils.sleep(10)
    }

    this.hashRate.stop()
  }

  setTarget(target: string): void {
    this.target = Buffer.from(target, 'hex')
  }

  newWork(miningRequestId: number, headerHex: string): void {
    const headerBytes = Buffer.from(headerHex, 'hex')
    headerBytes.set(this.graffiti, 176)
    this.miningRequestPayloads[miningRequestId] = Buffer.from(headerHex, 'hex')
    this.logger.info('new work', this.target.toString('hex'), miningRequestId)
    this.threadPool.newWork(headerBytes, this.target, miningRequestId)
  }
}
