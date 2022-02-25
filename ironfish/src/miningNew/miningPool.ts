/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { blake3 } from '@napi-rs/blake-hash'
import { ErrorUtils } from '..'
import { Assert } from '../assert'
import { createRootLogger, Logger } from '../logger'
import { Meter } from '../metrics/meter'
import { IronfishIpcClient } from '../rpc/clients'
import { SerializedBlockTemplate } from '../serde/BlockTemplateSerde'
import { SetTimeoutToken } from '../utils/types'
import { StratumServer } from './stratum/stratumServer'
import { mineableHeaderString } from './utils'

export class MiningPool {
  readonly hashRate: Meter
  readonly stratum: StratumServer
  readonly rpc: IronfishIpcClient
  readonly logger: Logger

  private started: boolean
  private stopPromise: Promise<void> | null = null
  private stopResolve: (() => void) | null = null

  private connectWarned: boolean
  private connectTimeout: SetTimeoutToken | null

  // TODO: Rename to job id or something
  nextMiningRequestId: number
  // TODO: LRU
  miningRequestBlocks: Map<number, SerializedBlockTemplate>

  // TODO: Difficulty adjustment!
  // baseTargetValue: number = 1
  target: Buffer

  currentHeadTimestamp: number | null
  currentHeadDifficulty: string | null

  constructor(options: { rpc: IronfishIpcClient; logger?: Logger }) {
    this.rpc = options.rpc
    this.hashRate = new Meter()
    this.logger = options.logger ?? createRootLogger()
    this.stratum = new StratumServer({ pool: this, logger: this.logger })
    this.nextMiningRequestId = 0
    this.miningRequestBlocks = new Map()
    this.currentHeadTimestamp = null
    this.currentHeadDifficulty = null

    this.target = Buffer.alloc(32)
    this.target.writeUInt32BE(65535)

    this.connectTimeout = null
    this.connectWarned = false
    this.started = false
  }

  start(): void {
    if (this.started) {
      return
    }

    this.stopPromise = new Promise((r) => (this.stopResolve = r))
    this.started = true
    this.hashRate.start()

    this.logger.info('Starting stratum server...')
    this.stratum.start()

    this.logger.info('Connecting to node...')
    this.rpc.onClose.on(this.onDisconnectRpc)
    void this.startConnectingRpc()
  }

  stop(): void {
    if (!this.started) {
      return
    }

    this.logger.debug('Stopping pool, goodbye')

    this.started = false
    this.rpc.onClose.off(this.onDisconnectRpc)
    this.rpc.close()
    this.stratum.stop()
    this.hashRate.stop()

    if (this.stopResolve) {
      this.stopResolve()
    }
  }

  async waitForStop(): Promise<void> {
    await this.stopPromise
  }

  getTarget(): string {
    return this.target.toString('hex')
  }

  submitWork(miningRequestId: number, randomness: number, graffiti: Buffer): void {
    const blockTemplate = this.miningRequestBlocks.get(miningRequestId)
    Assert.isNotUndefined(blockTemplate)

    blockTemplate.header.graffiti = graffiti.toString('hex')
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
      this.rpc.submitBlock(blockTemplate)
    }
  }

  private async startConnectingRpc(): Promise<void> {
    const connected = await this.rpc.tryConnect()

    if (!this.started) {
      return
    }

    if (!connected) {
      if (!this.connectWarned) {
        this.logger.warn(
          `Failed to connect to node on ${String(this.rpc.connection.mode)}, retrying...`,
        )
        this.connectWarned = true
      }

      this.connectTimeout = setTimeout(() => void this.startConnectingRpc(), 5000)
      return
    }

    this.connectWarned = false
    this.logger.info('Successfully connected to node')
    this.logger.info('Fetching latest block from node...')

    const response = await this.rpc.getBlockInfo({ sequence: -1 })
    this.currentHeadTimestamp = response.content.block.timestamp
    this.currentHeadDifficulty = response.content.block.difficulty

    this.logger.info(
      `Starting from latest block at sequence ${response.content.block.sequence}`,
    )

    this.logger.info('Listening to node for new blocks')

    void this.processNewBlocks().catch((e: unknown) => {
      this.logger.error('Fatal error occured while processing blocks from node:')
      this.logger.error(ErrorUtils.renderError(e, true))
      this.stop()
    })
  }

  private onDisconnectRpc = (): void => {
    this.logger.info('Disconnected from node unexpectedly. Reconnecting.')
    void this.startConnectingRpc()
  }

  private async processNewBlocks() {
    for await (const payload of this.rpc.blockTemplateStream().contentStream(true)) {
      // TODO: Should we just include this as part of the block template? Seems fairly reasonable
      const currentBlock = (
        await this.rpc.getBlockInfo({ hash: payload.header.previousBlockHash })
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
