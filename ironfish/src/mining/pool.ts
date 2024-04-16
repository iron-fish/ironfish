/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import LeastRecentlyUsed from 'blru'
import tls from 'tls'
import { Assert } from '../assert'
import { BlockHasher } from '../blockHasher'
import { Consensus } from '../consensus'
import { Config } from '../fileStores/config'
import { Logger } from '../logger'
import { Target } from '../primitives/target'
import { Transaction } from '../primitives/transaction'
import { RpcSocketClient } from '../rpc/clients'
import { RawBlockTemplateSerde, SerializedBlockTemplate } from '../serde/BlockTemplateSerde'
import { BigIntUtils } from '../utils/bigint'
import { ErrorUtils } from '../utils/error'
import { FileUtils } from '../utils/file'
import { GraffitiUtils } from '../utils/graffiti'
import { SetIntervalToken, SetTimeoutToken } from '../utils/types'
import { TransactionStatus } from '../wallet'
import { MiningPoolShares } from './poolShares'
import { StratumTcpAdapter, StratumTlsAdapter } from './stratum/adapters'
import { MiningStatusMessage } from './stratum/messages'
import { StratumServer } from './stratum/stratumServer'
import { StratumServerClient } from './stratum/stratumServerClient'
import { Explorer, WebhookNotifier } from './webhooks'

const RECALCULATE_TARGET_TIMEOUT = 10000
const EVENT_LOOP_MS = 10 * 1000

export class MiningPool {
  readonly stratum: StratumServer
  readonly rpc: RpcSocketClient
  readonly logger: Logger
  readonly shares: MiningPoolShares
  readonly config: Config
  readonly webhooks: WebhookNotifier[]

  private consensus: Consensus | null = null
  private blockHasher: BlockHasher | null = null

  private started: boolean
  private stopPromise: Promise<void> | null = null
  private stopResolve: (() => void) | null = null

  private connectWarned: boolean
  private connectTimeout: SetTimeoutToken | null

  private eventLoopTimeout: SetTimeoutToken | null

  name: string

  nextMiningRequestId: number
  miningRequestBlocks: LeastRecentlyUsed<number, SerializedBlockTemplate>
  recentSubmissions: Map<number, string[]>

  difficulty: bigint
  target: Buffer

  currentHeadTimestamp: number | null
  currentHeadDifficulty: bigint | null

  private recalculateTargetInterval: SetIntervalToken | null
  private notifyStatusInterval: SetIntervalToken | null

  private getExplorer: (networkId: number) => Explorer | null = () => null

  private constructor(options: {
    rpc: RpcSocketClient
    shares: MiningPoolShares
    config: Config
    logger: Logger
    webhooks?: WebhookNotifier[]
    banning?: boolean
    getExplorer?: (networkId: number) => Explorer | null
  }) {
    this.rpc = options.rpc
    this.logger = options.logger
    this.webhooks = options.webhooks ?? []
    this.stratum = new StratumServer({
      pool: this,
      config: options.config,
      logger: this.logger,
      banning: options.banning,
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
    this.target = BigIntUtils.writeBigU256BE(basePoolTarget)

    this.connectTimeout = null
    this.connectWarned = false
    this.started = false

    this.eventLoopTimeout = null

    this.recalculateTargetInterval = null
    this.notifyStatusInterval = null

    this.getExplorer = options.getExplorer ?? this.getExplorer
  }

  static async init(options: {
    rpc: RpcSocketClient
    config: Config
    logger: Logger
    webhooks?: WebhookNotifier[]
    enablePayouts?: boolean
    host: string
    port: number
    banning?: boolean
    tls?: boolean
    tlsOptions?: tls.TlsOptions
    getExplorer?: (networkId: number) => Explorer | null
  }): Promise<MiningPool> {
    const shares = await MiningPoolShares.init({
      rpc: options.rpc,
      config: options.config,
      logger: options.logger,
      webhooks: options.webhooks,
      enablePayouts: options.enablePayouts,
    })

    const pool = new MiningPool({
      rpc: options.rpc,
      logger: options.logger,
      config: options.config,
      webhooks: options.webhooks,
      shares,
      banning: options.banning,
      getExplorer: options.getExplorer,
    })

    if (options.tls) {
      Assert.isNotUndefined(options.tlsOptions)
      pool.stratum.mount(
        new StratumTlsAdapter({
          logger: options.logger,
          host: options.host,
          port: options.port,
          tlsOptions: options.tlsOptions,
        }),
      )
    } else {
      pool.stratum.mount(
        new StratumTcpAdapter({
          logger: options.logger,
          host: options.host,
          port: options.port,
        }),
      )
    }

    return pool
  }

  async start(): Promise<void> {
    if (this.started) {
      return
    }

    this.stopPromise = new Promise((r) => (this.stopResolve = r))
    this.started = true

    this.logger.info(`Starting stratum server`)
    await this.stratum.start()

    this.logger.info('Connecting to node...')
    this.rpc.onClose.on(this.onDisconnectRpc)

    await this.startConnectingRpc()

    await this.shares.start()

    const statusInterval = this.config.get('poolStatusNotificationInterval')
    if (statusInterval > 0) {
      this.notifyStatusInterval = setInterval(
        () => void this.notifyStatus(),
        statusInterval * 1000,
      )
    }

    void this.eventLoop()
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return
    }

    this.logger.debug('Stopping pool, goodbye')

    this.started = false
    this.rpc.onClose.off(this.onDisconnectRpc)
    this.rpc.close()
    await this.stratum.stop()

    await this.shares.stop()

    if (this.stopResolve) {
      this.stopResolve()
    }

    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout)
    }

    if (this.eventLoopTimeout) {
      clearTimeout(this.eventLoopTimeout)
    }

    if (this.recalculateTargetInterval) {
      clearInterval(this.recalculateTargetInterval)
    }

    if (this.notifyStatusInterval) {
      clearInterval(this.notifyStatusInterval)
    }
  }

  private async eventLoop(): Promise<void> {
    if (!this.started) {
      return
    }

    const eventLoopStartTime = new Date().getTime()

    await this.shares.rolloverPayoutPeriod()
    await this.updateUnconfirmedBlocks()
    await this.updateUnconfirmedPayoutTransactions()
    await this.shares.createNewPayout()

    const eventLoopEndTime = new Date().getTime()
    const eventLoopDuration = eventLoopEndTime - eventLoopStartTime
    this.logger.debug(`Mining pool event loop took ${eventLoopDuration} milliseconds`)

    this.eventLoopTimeout = setTimeout(() => void this.eventLoop(), EVENT_LOOP_MS)
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
    graffiti: string,
  ): Promise<{ error: string | null }> {
    Assert.isNotNull(client.subscription)
    Assert.isNotNull(this.blockHasher)

    if (graffiti.length !== 64) {
      const msg = `Client ${client.id} work with invalid custom graffiti length: ${graffiti.length}`
      this.logger.warn(msg)
      return { error: msg }
    } else {
      // TODO verify hex parse?
    }

    if (miningRequestId !== this.nextMiningRequestId - 1) {
      const msg = `Client ${client.id} submitted work for stale mining request: ${miningRequestId}`
      this.logger.debug(msg)
      return { error: msg }
    }

    const originalBlockTemplate = this.miningRequestBlocks.get(miningRequestId)

    if (!originalBlockTemplate) {
      const msg = `Client ${client.id} work for invalid mining request: ${miningRequestId}`
      this.logger.warn(msg)
      return { error: msg }
    }

    const blockTemplate = Object.assign({}, originalBlockTemplate)
    blockTemplate.header = Object.assign({}, originalBlockTemplate.header)

    const isDuplicate = this.isDuplicateSubmission(client.id, randomness, graffiti)

    if (isDuplicate) {
      const msg = `Client ${client.id} submitted a duplicate share: ${miningRequestId}, ${randomness}, ${graffiti}`
      this.logger.warn(msg)
      return { error: msg }
    }

    this.addWorkSubmission(client.id, randomness, graffiti)

    blockTemplate.header.graffiti = graffiti
    blockTemplate.header.randomness = randomness

    let hashedHeader: Buffer
    try {
      const rawBlock = RawBlockTemplateSerde.deserialize(blockTemplate)
      hashedHeader = this.blockHasher.hashHeader(rawBlock.header)
    } catch (error) {
      const msg = `${client.id} sent malformed work.`
      this.stratum.peers.punish(client, msg)
      return { error: msg }
    }

    if (hashedHeader.compare(Buffer.from(blockTemplate.header.target, 'hex')) !== 1) {
      this.logger.debug('Valid block, submitting to node')

      const result = await this.rpc.miner.submitBlock(blockTemplate)

      if (result.content.added) {
        const hashRate = await this.estimateHashRate()
        const hashedHeaderHex = hashedHeader.toString('hex')

        const minersFee = new Transaction(
          Buffer.from(blockTemplate.transactions[0], 'hex'),
        ).fee()

        await this.shares.submitBlock(blockTemplate.header.sequence, hashedHeaderHex, minersFee)

        this.logger.info(
          `Block ${hashedHeaderHex} submitted successfully! ${FileUtils.formatHashRate(
            hashRate,
          )}/s`,
        )
        this.webhooks.map((w) =>
          w.poolSubmittedBlock(hashedHeaderHex, hashRate, this.stratum.subscribed),
        )
      } else {
        this.logger.info(`Block was rejected: ${result.content.reason}`)
      }
    }

    if (hashedHeader.compare(this.target) !== 1) {
      await this.shares.submitShare(client.subscription.publicAddress)
      return { error: null }
    } else {
      return { error: 'low difficulty' }
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

    // Get block explorer URLs based on network ID
    const networkResponse = await this.rpc.chain.getNetworkInfo()
    const explorer = this.getExplorer(networkResponse.content.networkId)
    this.webhooks.map((w) => w.poolConnected(explorer ?? undefined))

    const consensusResponse = (await this.rpc.chain.getConsensusParameters()).content
    this.consensus = new Consensus(consensusResponse)

    // TODO: Add option for full cache FishHash verification
    this.blockHasher = new BlockHasher({
      consensus: this.consensus,
    })

    this.connectWarned = false
    this.logger.info('Successfully connected to node')
    this.logger.info('Listening to node for new blocks')

    void this.processNewBlocks().catch(async (e: unknown) => {
      this.logger.error('Fatal error occurred while processing blocks from node:')
      this.logger.error(ErrorUtils.renderError(e, true))
      await this.stop()
    })
  }

  private onDisconnectRpc = (): void => {
    this.stratum.waitForWork()

    this.logger.info('Disconnected from node unexpectedly. Reconnecting.')

    this.webhooks.map((w) => w.poolDisconnected())
    void this.startConnectingRpc()
  }

  private async processNewBlocks() {
    Assert.isNotNull(this.consensus)

    for await (const payload of this.rpc.miner.blockTemplateStream().contentStream()) {
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
    Assert.isNotNull(this.consensus)

    const currentBlock = this.miningRequestBlocks.get(this.nextMiningRequestId - 1)
    Assert.isNotNull(currentBlock)
    const latestBlock = Object.assign({}, currentBlock)
    latestBlock.header = Object.assign({}, currentBlock.header)

    Assert.isNotNull(latestBlock)

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
    this.distributeNewBlock(latestBlock)

    this.logger.debug('target recalculated', { prevHash: latestBlock.header.previousBlockHash })
  }

  graffiti(): Buffer {
    return GraffitiUtils.fromString(this.name)
  }

  private distributeNewBlock(newBlock: SerializedBlockTemplate) {
    Assert.isNotNull(this.currentHeadTimestamp)
    Assert.isNotNull(this.currentHeadDifficulty)
    Assert.isNotNull(this.blockHasher)

    const miningRequestId = this.nextMiningRequestId++
    this.miningRequestBlocks.set(miningRequestId, newBlock)
    this.recentSubmissions.clear()

    const rawBlock = RawBlockTemplateSerde.deserialize(newBlock)
    rawBlock.header.graffiti = this.graffiti()
    const newWork = this.blockHasher.serializeHeader(rawBlock.header)

    this.stratum.newWork(miningRequestId, newWork)
  }

  private restartCalculateTargetInterval() {
    if (this.recalculateTargetInterval) {
      clearInterval(this.recalculateTargetInterval)
    }

    this.recalculateTargetInterval = setInterval(() => {
      this.recalculateTarget()
    }, RECALCULATE_TARGET_TIMEOUT)
  }

  private isDuplicateSubmission(
    clientId: number,
    randomness: string,
    graffiti: string,
  ): boolean {
    const submissions = this.recentSubmissions.get(clientId)
    if (submissions == null) {
      return false
    }
    const k = randomness + '|' + graffiti
    return submissions.includes(k)
  }

  private addWorkSubmission(clientId: number, randomness: string, graffiti: string): void {
    const submissions = this.recentSubmissions.get(clientId)
    const k = randomness + '|' + graffiti
    if (submissions == null) {
      this.recentSubmissions.set(clientId, [k])
    } else {
      submissions.push(k)
      this.recentSubmissions.set(clientId, submissions)
    }
  }

  async estimateHashRate(publicAddress?: string): Promise<number> {
    // BigInt can't contain decimals, so multiply then divide to give decimal precision
    const shareRate = await this.shares.shareRate(publicAddress)
    const decimalPrecision = 1000000
    return (
      Number(BigInt(Math.floor(shareRate * decimalPrecision)) * this.difficulty) /
      decimalPrecision
    )
  }

  async notifyStatus(): Promise<void> {
    const status = await this.getStatus()
    this.logger.debug(`Mining pool status: ${JSON.stringify(status)}`)
    this.webhooks.map((w) => w.poolStatus(status))
  }

  async getStatus(publicAddress?: string): Promise<MiningStatusMessage> {
    const [hashRate, sharesPending] = await Promise.all([
      this.estimateHashRate(),
      this.shares.sharesPendingPayout(),
    ])

    let addressMinerCount = 0

    const status: MiningStatusMessage = {
      name: this.name,
      hashRate: hashRate,
      miners: this.stratum.subscribed,
      sharesPending: sharesPending,
      bans: this.stratum.peers.banCount,
      clients: this.stratum.clients.size,
    }

    if (publicAddress) {
      const [addressHashRate, addressSharesPending] = await Promise.all([
        this.estimateHashRate(publicAddress),
        this.shares.sharesPendingPayout(publicAddress),
      ])

      const addressConnectedMiners: string[] = []

      for (const client of this.stratum.clients.values()) {
        if (client.subscription?.publicAddress === publicAddress) {
          addressMinerCount++
          addressConnectedMiners.push(client.subscription.name || `Miner ${client.id}`)
        }
      }

      status.addressStatus = {
        publicAddress: publicAddress,
        hashRate: addressHashRate,
        miners: addressMinerCount,
        connectedMiners: addressConnectedMiners,
        sharesPending: addressSharesPending,
      }
    }

    return status
  }

  async updateUnconfirmedBlocks(): Promise<void> {
    const unconfirmedBlocks = await this.shares.unconfirmedBlocks()

    for (const block of unconfirmedBlocks) {
      const blockInfoResp = await this.rpc.chain.getBlock({
        hash: block.blockHash,
        confirmations: this.config.get('confirmations'),
      })

      const { main, confirmed } = blockInfoResp.content.metadata
      await this.shares.updateBlockStatus(block, main, confirmed)
    }
  }

  async updateUnconfirmedPayoutTransactions(): Promise<void> {
    const unconfirmedTransactions = await this.shares.unconfirmedPayoutTransactions()

    for (const transaction of unconfirmedTransactions) {
      const transactionInfoResp = await this.rpc.wallet.getAccountTransaction({
        hash: transaction.transactionHash,
        confirmations: this.config.get('confirmations'),
      })

      const transactionInfo = transactionInfoResp.content.transaction
      if (!transactionInfo) {
        this.logger.debug(`Transaction ${transaction.transactionHash} not found.`)
        continue
      }

      const confirmed = transactionInfo.status === TransactionStatus.CONFIRMED
      const expired = transactionInfo.status === TransactionStatus.EXPIRED
      await this.shares.updatePayoutTransactionStatus(transaction, confirmed, expired)
    }
  }
}
