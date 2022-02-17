/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Meter } from 'ironfish'
import { ThreadPoolHandler } from 'ironfish-rust-nodejs'
import net from 'net'

// TODO: Once this is started via CLI, we can probably use that to listen for graffiti changes, etc.
// TODO: Handle disconnects, etc.
export class MiningPoolMiner {
  // TODO: Send hash rate up to pool
  readonly hashRate: Meter
  readonly threadPool: ThreadPoolHandler
  readonly stratum: StratumClient

  // TODO: Think about best way to store data at each level, miner, pool, server, client
  graffiti: string
  graffitiBuffer: Buffer
  miningRequestId: number
  // TODO: LRU
  miningRequestPayloads: { [index: number]: Buffer } = {}
  target: Buffer

  private constructor(threadPool: ThreadPoolHandler, graffiti: string) {
    this.hashRate = new Meter()
    this.threadPool = threadPool
    this.stratum = new StratumClient(this)
    this.miningRequestId = 0
    this.graffiti = graffiti
    this.graffitiBuffer = Buffer.alloc(32)
    this.graffitiBuffer.write(graffiti)
    this.target = Buffer.alloc(32)
    this.target.writeUInt32BE(65535)
  }

  static async init(graffiti: string): Promise<Miner> {
    // TODO: Confirm that this can't be set via config or anything
    // TODO: Bring this in from CLI arg or something
    const threadCount = 1

    const threadPool = new ThreadPoolHandler(threadCount)

    return new Miner(threadPool, graffiti)
  }

  async mine() {
    this.hashRate.start()
    this.stratum.start(this.graffiti)

    while (true) {
      // TODO: Turn this into an AsyncGenerator type thing on the JS side?
      const blockResult = this.threadPool.getFoundBlock()
      if (blockResult != null) {
        const { miningRequestId, randomness, blockHash } = blockResult
        console.log('Found block:', randomness, miningRequestId, blockHash)
        this.stratum.submit(miningRequestId, randomness, this.graffiti)
      }

      const hashRate = this.threadPool.getHashRateSubmission()
      this.hashRate.add(hashRate)

      await sleep(10)
    }

    this.hashRate.stop()
  }

  setTarget(target: string) {
    this.target = Buffer.from(target, 'hex')
  }

  newWork(miningRequestId: number, headerHex: string) {
    const headerBytes = Buffer.from(headerHex, 'hex')
    headerBytes.set(this.graffitiBuffer, 176)
    this.miningRequestPayloads[miningRequestId] = Buffer.from(headerHex, 'hex')
    console.log('new work', this.target.toString('hex'), miningRequestId)
    this.threadPool.newWork(headerBytes, this.target, miningRequestId)
  }
}
