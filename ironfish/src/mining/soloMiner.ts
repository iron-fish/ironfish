/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ThreadPoolHandler } from '@ironfish/rust-nodejs'
import { Assert } from '../assert'
import { serializeHeaderBlake3, serializeHeaderFishHash } from '../blockHasher'
import { Consensus } from '../consensus'
import { Logger } from '../logger'
import { Meter } from '../metrics/meter'
import { Target } from '../primitives/target'
import { RpcSocketClient } from '../rpc/clients/socketClient'
import { RawBlockTemplateSerde, SerializedBlockTemplate } from '../serde/BlockTemplateSerde'
import { BigIntUtils } from '../utils/bigint'
import { ErrorUtils } from '../utils/error'
import { FileUtils } from '../utils/file'
import { PromiseUtils } from '../utils/promise'
import { SetTimeoutToken } from '../utils/types'

const RECALCULATE_TARGET_TIMEOUT = 10000

export class MiningSoloMiner {
  readonly hashRate: Meter
  readonly threadPool: ThreadPoolHandler
  readonly logger: Logger
  readonly rpc: RpcSocketClient

  private started: boolean
  private stopPromise: Promise<void> | null
  private stopResolve: (() => void) | null

  private connectWarned: boolean
  private connectTimeout: SetTimeoutToken | null

  private nextMiningRequestId: number
  private miningRequestBlocks: Map<number, SerializedBlockTemplate>
  private miningRequestId: number

  private consensus: Consensus | null = null

  private currentHeadTimestamp: number | null
  private currentHeadDifficulty: bigint | null

  graffiti: Buffer
  target: Buffer
  waiting: boolean
  recalculateTargetInterval: SetTimeoutToken | null

  constructor(options: {
    threadCount: number
    batchSize: number
    logger: Logger
    graffiti: Buffer
    rpc: RpcSocketClient
    fishHashFullContext: boolean
  }) {
    this.rpc = options.rpc
    this.logger = options.logger
    this.graffiti = options.graffiti

    const threadCount = options.threadCount ?? 1
    this.threadPool = new ThreadPoolHandler(
      threadCount,
      options.batchSize,
      true,
      true,
      options.fishHashFullContext,
    )

    this.miningRequestId = 0
    this.nextMiningRequestId = 0
    this.miningRequestBlocks = new Map()

    this.target = Buffer.alloc(32, 0)

    this.currentHeadTimestamp = null
    this.currentHeadDifficulty = null

    this.hashRate = new Meter()
    this.stopPromise = null
    this.stopResolve = null
    this.waiting = false
    this.connectWarned = false
    this.connectTimeout = null
    this.recalculateTargetInterval = null
    this.started = false
  }

  start(): void {
    if (this.started) {
      return
    }

    this.stopPromise = new Promise((r) => (this.stopResolve = r))
    this.started = true
    this.hashRate.start()

    void this.mine()

    this.logger.info('Connecting to node...')
    this.rpc.onClose.on(this.onDisconnectRpc)
    void this.startConnectingRpc()
  }

  stop(): void {
    if (!this.started) {
      return
    }

    this.logger.debug('Stopping miner, goodbye')

    this.started = false
    this.rpc.onClose.off(this.onDisconnectRpc)
    this.rpc.close()
    this.hashRate.stop()

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

  waitForWork(): void {
    this.waiting = true
    this.threadPool.pause()
  }

  private onDisconnectRpc = (): void => {
    this.waitForWork()

    this.logger.info('Disconnected from node unexpectedly. Reconnecting.')
    void this.startConnectingRpc()
  }

  private async processNewBlocks() {
    Assert.isNotNull(this.consensus)

    for await (const payload of this.rpc.miner.blockTemplateStream().contentStream()) {
      Assert.isNotUndefined(payload.previousBlockInfo)

      const currentHeadTarget = new Target(Buffer.from(payload.previousBlockInfo.target, 'hex'))
      this.currentHeadDifficulty = currentHeadTarget.toDifficulty()
      this.currentHeadTimestamp = payload.previousBlockInfo.timestamp

      this.restartCalculateTargetInterval()
      this.startNewWork(payload)
    }
  }

  private startNewWork(block: SerializedBlockTemplate) {
    Assert.isNotNull(this.currentHeadTimestamp)
    Assert.isNotNull(this.currentHeadDifficulty)
    Assert.isNotNull(this.consensus)

    const miningRequestId = this.nextMiningRequestId++
    this.miningRequestBlocks.set(miningRequestId, block)
    this.miningRequestId = miningRequestId

    this.target = Buffer.from(block.header.target, 'hex')

    const rawBlock = RawBlockTemplateSerde.deserialize(block)
    rawBlock.header.graffiti = this.graffiti

    const fishHashBlock = this.consensus.isActive('enableFishHash', rawBlock.header.sequence)
    const headerBytes = fishHashBlock
      ? serializeHeaderFishHash(rawBlock.header)
      : serializeHeaderBlake3(rawBlock.header)

    this.logger.debug(
      `new work ${this.target.toString('hex')}, ${miningRequestId} ${FileUtils.formatHashRate(
        this.hashRate.rate1s,
      )}/s`,
    )

    this.waiting = false
    this.threadPool.newWork(headerBytes, this.target, miningRequestId, fishHashBlock, 0)
  }

  private async mine(): Promise<void> {
    while (this.started) {
      const blockResult = this.threadPool.getFoundBlock()

      if (blockResult != null) {
        const { miningRequestId, randomness } = blockResult

        this.logger.info(
          `Found block: ${randomness} ${miningRequestId} ${FileUtils.formatHashRate(
            this.hashRate.rate1s,
          )}/s`,
        )

        void this.submitWork(miningRequestId, randomness, this.graffiti)
      }

      const hashRate = this.threadPool.getHashRateSubmission()
      this.hashRate.add(hashRate)

      await PromiseUtils.sleep(10)
    }

    this.hashRate.stop()
  }

  async submitWork(
    miningRequestId: number,
    randomness: string,
    graffiti: Buffer,
  ): Promise<void> {
    const blockTemplate = this.miningRequestBlocks.get(miningRequestId)
    Assert.isNotUndefined(blockTemplate)

    blockTemplate.header.graffiti = graffiti.toString('hex')
    blockTemplate.header.randomness = randomness

    this.logger.debug('Valid block, submitting to node')

    const result = await this.rpc.miner.submitBlock(blockTemplate)

    if (result.content.added) {
      this.logger.info(
        `Block submitted successfully! ${FileUtils.formatHashRate(this.hashRate.rate1s)}/s`,
      )
    } else {
      this.logger.info(`Block was rejected: ${result.content.reason}`)
    }
  }

  private async startConnectingRpc(): Promise<void> {
    const connected = await this.rpc.tryConnect()

    if (!this.started) {
      return
    }

    if (!connected) {
      if (!this.connectWarned) {
        this.logger.warn(`Failed to connect to node on ${this.rpc.describe()}, retrying...`)
        this.connectWarned = true
      }

      this.connectTimeout = setTimeout(() => void this.startConnectingRpc(), 5000)
      return
    }

    const consensusResponse = (await this.rpc.chain.getConsensusParameters()).content
    this.consensus = new Consensus(consensusResponse)

    this.connectWarned = false
    this.logger.info('Successfully connected to node')
    this.logger.info('Listening to node for new blocks')

    void this.processNewBlocks().catch((e: unknown) => {
      this.logger.error('Fatal error occurred while processing blocks from node:')
      this.logger.error(ErrorUtils.renderError(e, true))
      this.stop()
    })
  }

  private recalculateTarget() {
    Assert.isNotNull(this.currentHeadTimestamp)
    Assert.isNotNull(this.currentHeadDifficulty)
    Assert.isNotNull(this.consensus)

    const latestBlock = this.miningRequestBlocks.get(this.nextMiningRequestId - 1)
    Assert.isNotUndefined(latestBlock)

    const newTime = new Date()
    const newTarget = Target.fromDifficulty(
      Target.calculateDifficulty(
        this.consensus,
        latestBlock.header.sequence,
        newTime,
        new Date(this.currentHeadTimestamp),
        this.currentHeadDifficulty,
      ),
    )

    latestBlock.header.target = BigIntUtils.writeBigU256BE(newTarget.asBigInt()).toString('hex')
    latestBlock.header.timestamp = newTime.getTime()

    this.startNewWork(latestBlock)
  }

  private restartCalculateTargetInterval() {
    if (this.recalculateTargetInterval) {
      clearInterval(this.recalculateTargetInterval)
    }

    this.recalculateTargetInterval = setInterval(() => {
      this.recalculateTarget()
    }, RECALCULATE_TARGET_TIMEOUT)
  }
}
