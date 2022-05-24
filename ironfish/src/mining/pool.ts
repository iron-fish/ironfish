/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { blake3 } from '@napi-rs/blake-hash'
import LeastRecentlyUsed from 'blru'
import { Assert } from '../assert'
import { Config } from '../fileStores/config'
import { createRootLogger, Logger } from '../logger'
import { Target } from '../primitives/target'
import { IronfishIpcClient } from '../rpc/clients'
import { SerializedBlockTemplate } from '../serde/BlockTemplateSerde'
import { BigIntUtils } from '../utils/bigint'
import { ErrorUtils } from '../utils/error'
import { FileUtils } from '../utils/file'
import { SetTimeoutToken } from '../utils/types'
import { Discord } from './discord'
import { MiningPoolShares } from './poolShares'
import { StratumServer, StratumServerClient } from './stratum/stratumServer'
import { mineableHeaderString } from './utils'

const RECALCULATE_TARGET_TIMEOUT = 10000

export class MiningPool {
  readonly stratum: StratumServer
  readonly rpc: IronfishIpcClient
  readonly logger: Logger
  readonly shares: MiningPoolShares
  readonly config: Config
  readonly discord: Discord | null

  private started: boolean
  private stopPromise: Promise<void> | null = null
  private stopResolve: (() => void) | null = null

  private connectWarned: boolean
  private connectTimeout: SetTimeoutToken | null

  name: string

  nextMiningRequestId: number
  miningRequestBlocks: LeastRecentlyUsed<number, SerializedBlockTemplate>
  recentSubmissions: Map<number, string[]>

  difficulty: bigint
  target: Buffer

  currentHeadTimestamp: number | null
  currentHeadDifficulty: bigint | null

  recalculateTargetInterval: SetTimeoutToken | null

  private constructor(options: {
    rpc: IronfishIpcClient
    shares: MiningPoolShares
    config: Config
    logger?: Logger
    discord?: Discord
    host?: string
    port?: number
  }) {
    this.rpc = options.rpc
    this.logger = options.logger ?? createRootLogger()
    this.discord = options.discord ?? null
    this.stratum = new StratumServer({
      pool: this,
      config: options.config,
      logger: this.logger,
      host: options.host,
      port: options.port,
    })
    this.config = options.config
    this.shares = options.shares
    this.nextMiningRequestId = 0
    this.miningRequestBlocks = new LeastRecentlyUsed(12)
    this.recentSubmissions = new Map()
    this.currentHeadTimestamp = null
    this.currentHeadDifficulty = null

    this.name = this.config.get('poolName')

    this.difficulty = BigInt(this.config.get('poolDifficulty'))
    const basePoolTarget = Target.fromDifficulty(this.difficulty).asBigInt()
    this.target = BigIntUtils.toBytesBE(basePoolTarget, 32)

    this.connectTimeout = null
    this.connectWarned = false
    this.started = false

    this.recalculateTargetInterval = null
  }

  static async init(options: {
    rpc: IronfishIpcClient
    config: Config
    logger?: Logger
    discord?: Discord
    enablePayouts?: boolean
    host?: string
    port?: number
    balancePercentPayoutFlag?: number
  }): Promise<MiningPool> {
    const shares = await MiningPoolShares.init({
      rpc: options.rpc,
      config: options.config,
      logger: options.logger,
      discord: options.discord,
      enablePayouts: options.enablePayouts,
      balancePercentPayoutFlag: options.balancePercentPayoutFlag,
    })

    return new MiningPool({
      rpc: options.rpc,
      logger: options.logger,
      config: options.config,
      discord: options.discord,
      host: options.host,
      port: options.port,
      shares,
    })
  }

  async start(): Promise<void> {
    if (this.started) {
      return
    }

    this.stopPromise = new Promise((r) => (this.stopResolve = r))
    this.started = true
    await this.shares.start()

    this.logger.info(`Starting stratum server on ${this.stratum.host}:${this.stratum.port}`)
    this.stratum.start()

    this.logger.info('Connecting to node...')
    this.rpc.onClose.on(this.onDisconnectRpc)
    void this.startConnectingRpc()
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return
    }

    this.logger.debug('Stopping pool, goodbye')

    this.started = false
    this.rpc.onClose.off(this.onDisconnectRpc)
    this.rpc.close()
    this.stratum.stop()

    await this.shares.stop()

    if (this.stopResolve) {
      this.stopResolve()
    }

    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout)
    }

    if (this.recalculateTargetInterval) {
      clearInterval(this.recalculateTargetInterval)
    }
  }

  async waitForStop(): Promise<void> {
    await this.stopPromise
  }

  getTarget(): string {
    return this.target.toString('hex')
  }

  async submitWork(
    client: StratumServerClient,
    miningRequestId: number,
    randomness: string,
  ): Promise<void> {
    Assert.isNotNull(client.publicAddress)
    Assert.isNotNull(client.graffiti)
    if (miningRequestId !== this.nextMiningRequestId - 1) {
      this.logger.debug(
        `Client ${client.id} submitted work for stale mining request: ${miningRequestId}`,
      )
      return
    }

    const originalBlockTemplate = this.miningRequestBlocks.get(miningRequestId)

    if (!originalBlockTemplate) {
      this.logger.warn(
        `Client ${client.id} work for invalid mining request: ${miningRequestId}`,
      )
      return
    }

    const blockTemplate = Object.assign({}, originalBlockTemplate)
    blockTemplate.header = Object.assign({}, originalBlockTemplate.header)

    const isDuplicate = this.isDuplicateSubmission(client.id, randomness)

    if (isDuplicate) {
      this.logger.warn(
        `Client ${client.id} submitted a duplicate mining request: ${miningRequestId}, ${randomness}`,
      )
      return
    }

    this.addWorkSubmission(client.id, randomness)

    blockTemplate.header.graffiti = client.graffiti.toString('hex')
    blockTemplate.header.randomness = randomness

    let headerBytes
    try {
      headerBytes = mineableHeaderString(blockTemplate.header)
    } catch (error) {
      this.logger.debug(`${client.id} sent malformed work. No longer sending work.`)
      this.stratum.addBadClient(client)
      return
    }
    const hashedHeader = blake3(headerBytes)

    if (hashedHeader.compare(Buffer.from(blockTemplate.header.target, 'hex')) !== 1) {
      this.logger.debug('Valid block, submitting to node')

      const result = await this.rpc.submitBlock(blockTemplate)

      if (result.content.added) {
        const hashRate = await this.estimateHashRate()

        this.logger.info(
          `Block ${hashedHeader.toString(
            'hex',
          )} submitted successfully! ${FileUtils.formatHashRate(hashRate)}/s`,
        )
        this.discord?.poolSubmittedBlock(hashedHeader, hashRate, this.stratum.getClientCount())
      } else {
        this.logger.info(`Block was rejected: ${result.content.reason}`)
      }
    }

    if (hashedHeader.compare(this.target) !== 1) {
      this.logger.debug('Valid pool share submitted')
      await this.shares.submitShare(client.publicAddress)
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

    if (this.connectWarned) {
      this.discord?.poolConnected()
    }

    this.connectWarned = false
    this.logger.info('Successfully connected to node')
    this.logger.info('Listening to node for new blocks')

    void this.processNewBlocks().catch(async (e: unknown) => {
      this.logger.error('Fatal error occured while processing blocks from node:')
      this.logger.error(ErrorUtils.renderError(e, true))
      await this.stop()
    })
  }

  private onDisconnectRpc = (): void => {
    this.stratum.waitForWork()

    this.logger.info('Disconnected from node unexpectedly. Reconnecting.')
    this.discord?.poolDisconnected()
    void this.startConnectingRpc()
  }

  private async processNewBlocks() {
    for await (const payload of this.rpc.blockTemplateStream().contentStream(true)) {
      Assert.isNotUndefined(payload.previousBlockInfo)
      this.restartCalculateTargetInterval()

      const currentHeadTarget = new Target(Buffer.from(payload.previousBlockInfo.target, 'hex'))
      this.currentHeadDifficulty = currentHeadTarget.toDifficulty()
      this.currentHeadTimestamp = payload.previousBlockInfo.timestamp

      this.distributeNewBlock(payload)
    }
  }

  private recalculateTarget() {
    this.logger.debug('recalculating target')

    Assert.isNotNull(this.currentHeadTimestamp)
    Assert.isNotNull(this.currentHeadDifficulty)

    const latestBlock = this.miningRequestBlocks.get(this.nextMiningRequestId - 1)
    Assert.isNotNull(latestBlock)

    const newTime = new Date()
    const newTarget = Target.fromDifficulty(
      Target.calculateDifficulty(
        newTime,
        new Date(this.currentHeadTimestamp),
        this.currentHeadDifficulty,
      ),
    )

    // Target might be the same if there is a slight timing issue or if the block is at max target.
    // In this case, it is detrimental to send out new work as it will needlessly reset miner's search
    // space, resulting in duplicated work.
    const existingTarget = BigIntUtils.fromBytes(Buffer.from(latestBlock.header.target, 'hex'))
    if (newTarget.asBigInt() === existingTarget) {
      this.logger.debug(
        `New target ${newTarget.asBigInt()} is the same as the existing target, no need to send out new work.`,
      )
      return
    }

    latestBlock.header.target = BigIntUtils.toBytesBE(newTarget.asBigInt(), 32).toString('hex')
    latestBlock.header.timestamp = newTime.getTime()
    this.distributeNewBlock(latestBlock)

    this.logger.debug('target recalculated', { prevHash: latestBlock.header.previousBlockHash })
  }

  private distributeNewBlock(newBlock: SerializedBlockTemplate) {
    Assert.isNotNull(this.currentHeadTimestamp)
    Assert.isNotNull(this.currentHeadDifficulty)

    const miningRequestId = this.nextMiningRequestId++
    this.miningRequestBlocks.set(miningRequestId, newBlock)
    this.recentSubmissions.clear()

    this.stratum.newWork(miningRequestId, newBlock)
  }

  private restartCalculateTargetInterval() {
    if (this.recalculateTargetInterval) {
      clearInterval(this.recalculateTargetInterval)
    }

    this.recalculateTargetInterval = setInterval(() => {
      this.recalculateTarget()
    }, RECALCULATE_TARGET_TIMEOUT)
  }

  private isDuplicateSubmission(clientId: number, randomness: string): boolean {
    const submissions = this.recentSubmissions.get(clientId)
    if (submissions == null) {
      return false
    }
    return submissions.includes(randomness)
  }

  private addWorkSubmission(clientId: number, randomness: string): void {
    const submissions = this.recentSubmissions.get(clientId)
    if (submissions == null) {
      this.recentSubmissions.set(clientId, [randomness])
    } else {
      submissions.push(randomness)
      this.recentSubmissions.set(clientId, submissions)
    }
  }

  async estimateHashRate(): Promise<number> {
    // BigInt can't contain decimals, so multiply then divide to give decimal precision
    const shareRate = await this.shares.shareRate()
    const decimalPrecision = 1000000
    return (
      Number(BigInt(Math.floor(shareRate * decimalPrecision)) * this.difficulty) /
      decimalPrecision
    )
  }
}
