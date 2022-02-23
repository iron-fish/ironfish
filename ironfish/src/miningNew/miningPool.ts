/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { blake3 } from '@napi-rs/blake-hash'
import net from 'net'
import { Meter } from '../metrics/meter'
import { IronfishRpcClient } from '../rpc/clients/rpcClient'
import { IronfishSdk } from '../sdk'
import { SerializedBlockTemplate } from '../serde/BlockTemplateSerde'
import { PromiseUtils } from '../utils/promise'
import { StratumServer } from './stratum/stratumServer'
import { mineableHeaderString } from './utils'

export class MiningPool {
  readonly sdk: IronfishSdk
  readonly nodeClient: IronfishRpcClient
  readonly hashRate: Meter
  readonly stratum: StratumServer

  // TODO: Rename to job id or something
  nextMiningRequestId: number
  // TODO: LRU
  miningRequestBlocks: { [index: number]: SerializedBlockTemplate }

  // TODO: Difficulty adjustment!
  // baseTargetValue: number = 1
  target: Buffer = Buffer.alloc(32)

  currentHeadTimestamp: number
  currentHeadDifficulty: string

  // TODO: Disconnects

  private constructor(
    sdk: IronfishSdk,
    nodeClient: IronfishRpcClient,
    { timestamp, difficulty }: { timestamp: number; difficulty: string },
  ) {
    this.sdk = sdk
    this.nodeClient = nodeClient
    this.hashRate = new Meter()
    this.stratum = new StratumServer(this)
    this.nextMiningRequestId = 0
    this.miningRequestBlocks = {}
    this.target.writeUInt32BE(65535)
    this.currentHeadTimestamp = timestamp
    this.currentHeadDifficulty = difficulty
  }

  static async init(): Promise<MiningPool> {
    // TODO: Hashrate
    // TODO: Add IPC support for slightly improved speed?
    const configOverrides = {
      enableRpcTcp: true,
      rpcTcpHost: 'localhost',
      rpcTcpPort: 8001,
    }

    const sdk = await IronfishSdk.init({ configOverrides: configOverrides })
    const nodeClient = await sdk.connectRpc()
    const currentBlock = (await nodeClient.getBlockInfo({ sequence: -1 })).content.block
    return new MiningPool(sdk, nodeClient, currentBlock)
  }

  async start() {
    this.hashRate.start()
    this.stratum.start()
    this.processNewBlocks()

    // eslint-disable-next-line no-constant-condition
    while (true) {
      await PromiseUtils.sleep(1000)
    }

    console.log('Stopping, goodbye')
    this.hashRate.stop()
  }

  getTarget(): string {
    return this.target.toString('hex')
  }

  submitWork(miningRequestId: number, randomness: number, graffiti: string): void {
    const graffitiBuff = Buffer.alloc(32)
    graffitiBuff.write(graffiti)

    const blockTemplate = this.miningRequestBlocks[miningRequestId]

    blockTemplate.header.graffiti = graffitiBuff.toString('hex')
    blockTemplate.header.randomness = randomness

    const headerBytes = mineableHeaderString(blockTemplate.header)
    const hashedHeader = blake3(headerBytes)

    if (hashedHeader < this.target) {
      console.log('Valid pool share submitted')
    }

    if (hashedHeader < Buffer.from(blockTemplate.header.target, 'hex')) {
      // TODO: this seems to (sometimes?) have significant delay, look into why.
      // is it a socket buffer flush issue or a slowdown on the node side?
      console.log('Valid block, submitting to node')
      this.nodeClient.submitBlock(blockTemplate)
    }
  }

  private async processNewBlocks() {
    for await (const payload of this.nodeClient.blockTemplateStream().contentStream()) {
      // TODO: Should we just include this as part of the block template? Seems fairly reasonable
      const currentBlock = (
        await this.nodeClient.getBlockInfo({ hash: payload.header.previousBlockHash })
      ).content.block

      this.currentHeadDifficulty = currentBlock.difficulty
      this.currentHeadTimestamp = currentBlock.timestamp

      const miningRequestId = this.nextMiningRequestId++
      this.miningRequestBlocks[miningRequestId] = payload

      this.stratum.newWork(
        miningRequestId,
        payload,
        this.currentHeadDifficulty,
        this.currentHeadTimestamp,
      )
    }
  }
}
