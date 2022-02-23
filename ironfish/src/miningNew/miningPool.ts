/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { blake3 } from '@napi-rs/blake-hash'
import { Assert } from '..'
import { createRootLogger, Logger } from '../logger'
import { Meter } from '../metrics/meter'
import { IronfishRpcClient } from '../rpc/clients/rpcClient'
import { GetBlockInfoResponse } from '../rpc/routes/chain/getBlockInfo'
import { IronfishSdk } from '../sdk'
import { SerializedBlockTemplate } from '../serde/BlockTemplateSerde'
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
  miningRequestBlocks: Map<number, SerializedBlockTemplate>

  // TODO: Difficulty adjustment!
  // baseTargetValue: number = 1
  target: Buffer = Buffer.alloc(32)

  currentHeadTimestamp: number
  currentHeadDifficulty: string
  logger: Logger

  // TODO: Disconnects

  static async init(options?: { sdk?: IronfishSdk }): Promise<MiningPool> {
    const sdk =
      options?.sdk ??
      (await IronfishSdk.init({
        configOverrides: {
          enableRpcTcp: true,
          rpcTcpHost: 'localhost',
          rpcTcpPort: 8001,
        },
      }))

    const nodeClient = await sdk.connectRpc()
    const currentBlock = (await nodeClient.getBlockInfo({ sequence: -1 })).content.block

    return new MiningPool({ sdk, nodeClient, currentBlock })
  }

  private constructor(options: {
    sdk: IronfishSdk
    nodeClient: IronfishRpcClient
    currentBlock: GetBlockInfoResponse['block']
    logger?: Logger
  }) {
    this.sdk = options.sdk
    this.nodeClient = options.nodeClient
    this.hashRate = new Meter()
    this.logger = options.logger ?? createRootLogger()
    this.stratum = new StratumServer({ pool: this, logger: this.logger })
    this.nextMiningRequestId = 0
    this.miningRequestBlocks = new Map()
    this.target.writeUInt32BE(65535)
    this.currentHeadTimestamp = options.currentBlock.timestamp
    this.currentHeadDifficulty = options.currentBlock.difficulty
  }

  start(): void {
    this.hashRate.start()
    this.stratum.start()
    void this.processNewBlocks()
  }

  stop(): void {
    this.logger.debug('Stopping, goodbye')
    this.stratum.stop()
    this.hashRate.stop()
  }

  getTarget(): string {
    return this.target.toString('hex')
  }

  submitWork(miningRequestId: number, randomness: number, graffiti: string): void {
    const graffitiBuff = Buffer.alloc(32)
    graffitiBuff.write(graffiti)

    const blockTemplate = this.miningRequestBlocks.get(miningRequestId)
    Assert.isNotUndefined(blockTemplate)

    blockTemplate.header.graffiti = graffitiBuff.toString('hex')
    blockTemplate.header.randomness = randomness

    const headerBytes = mineableHeaderString(blockTemplate.header)
    const hashedHeader = blake3(headerBytes)

    if (hashedHeader < this.target) {
      this.logger.info('Valid pool share submitted')
    }

    if (hashedHeader < Buffer.from(blockTemplate.header.target, 'hex')) {
      // TODO: this seems to (sometimes?) have significant delay, look into why.
      // is it a socket buffer flush issue or a slowdown on the node side?
      this.logger.info('Valid block, submitting to node')
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
      this.miningRequestBlocks.set(miningRequestId, payload)

      this.stratum.newWork(
        miningRequestId,
        payload,
        this.currentHeadDifficulty,
        this.currentHeadTimestamp,
      )
    }
  }
}

// DISCONNECTED
// CONNECTING
// CONNECTED
//   processNewBlocks()
