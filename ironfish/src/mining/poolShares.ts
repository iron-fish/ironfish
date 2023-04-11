/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { Assert } from '../assert'
import { Config } from '../fileStores/config'
import { Logger } from '../logger'
import { RpcClient } from '../rpc/clients/client'
import { CurrencyUtils, ErrorUtils } from '../utils'
import { PoolDatabase } from './poolDatabase'
import { DatabaseBlock, DatabasePayoutTransaction } from './poolDatabase/database'
import { WebhookNotifier } from './webhooks'

export class MiningPoolShares {
  readonly rpc: RpcClient
  readonly config: Config
  readonly logger: Logger
  readonly webhooks: WebhookNotifier[]

  private readonly db: PoolDatabase
  private enablePayouts: boolean

  private poolName: string
  private recentShareCutoff: number
  private accountName: string | undefined

  private constructor(options: {
    db: PoolDatabase
    rpc: RpcClient
    config: Config
    logger: Logger
    webhooks?: WebhookNotifier[]
    enablePayouts?: boolean
  }) {
    this.db = options.db
    this.rpc = options.rpc
    this.config = options.config
    this.logger = options.logger
    this.webhooks = options.webhooks ?? []
    this.enablePayouts = options.enablePayouts ?? true

    this.poolName = this.config.get('poolName')
    this.recentShareCutoff = this.config.get('poolRecentShareCutoff')
    this.accountName = this.config.get('poolAccountName')
  }

  static async init(options: {
    rpc: RpcClient
    config: Config
    logger: Logger
    webhooks?: WebhookNotifier[]
    enablePayouts?: boolean
    dbPath?: string
  }): Promise<MiningPoolShares> {
    const db = await PoolDatabase.init({
      config: options.config,
      logger: options.logger,
      dbPath: options.dbPath,
    })

    return new MiningPoolShares({
      db,
      rpc: options.rpc,
      config: options.config,
      logger: options.logger,
      webhooks: options.webhooks,
      enablePayouts: options.enablePayouts,
    })
  }

  async start(): Promise<void> {
    if (this.enablePayouts) {
      await this.assertAccountExists()
    }

    await this.db.start()
  }

  async stop(): Promise<void> {
    await this.db.stop()
  }

  async submitShare(publicAddress: string): Promise<void> {
    await this.db.newShare(publicAddress)
  }

  async shareRate(publicAddress?: string): Promise<number> {
    const timestamp = new Date().getTime() - this.recentShareCutoff * 1000
    const recentShareCount = await this.db.shareCountSince(timestamp, publicAddress)

    return recentShareCount / this.recentShareCutoff
  }

  async sharesPendingPayout(publicAddress?: string): Promise<number> {
    return await this.db.pendingShareCount(publicAddress)
  }

  async rolloverPayoutPeriod(): Promise<void> {
    const payoutPeriodDuration = this.config.get('poolPayoutPeriodDuration') * 1000
    const now = new Date().getTime()
    const payoutPeriodCutoff = now - payoutPeriodDuration

    const payoutPeriod = await this.db.getCurrentPayoutPeriod()

    if (payoutPeriod && payoutPeriod.start > payoutPeriodCutoff) {
      // Current payout period has not exceeded its duration yet
      return
    }

    await this.db.rolloverPayoutPeriod(now)
  }

  async submitBlock(sequence: number, hash: string, reward: bigint): Promise<void> {
    if (reward < 0) {
      reward *= BigInt(-1)
    }

    await this.db.newBlock(sequence, hash, reward.toString())
  }

  async unconfirmedBlocks(): Promise<DatabaseBlock[]> {
    return await this.db.unconfirmedBlocks()
  }

  async updateBlockStatus(
    block: DatabaseBlock,
    main: boolean,
    confirmed: boolean,
  ): Promise<void> {
    if (main === block.main && confirmed === block.confirmed) {
      return
    }

    await this.db.updateBlockStatus(block.id, main, confirmed)
  }

  async unconfirmedPayoutTransactions(): Promise<DatabasePayoutTransaction[]> {
    return await this.db.unconfirmedTransactions()
  }

  async updatePayoutTransactionStatus(
    transaction: DatabasePayoutTransaction,
    confirmed: boolean,
    expired: boolean,
  ): Promise<void> {
    if (confirmed === transaction.confirmed && expired === transaction.expired) {
      return
    }

    await this.db.updateTransactionStatus(transaction.id, confirmed, expired)

    if (expired && !confirmed) {
      await this.db.markSharesUnpaid(transaction.id)
    }
  }

  async createNewPayout(): Promise<void> {
    if (!this.enablePayouts) {
      return
    }

    // Get the earliest payout the has shares that have not yet been paid out
    const payoutPeriod = await this.db.earliestOutstandingPayoutPeriod()
    if (!payoutPeriod) {
      this.logger.debug('No outstanding shares, skipping payout')
      return
    }

    // Ensure all of the blocks submitted during the related periods are
    // confirmed so that we are not sending out payouts of incorrect or changing
    // amounts
    const blocksConfirmed = await this.db.payoutPeriodBlocksConfirmed(payoutPeriod.id)
    if (!blocksConfirmed) {
      this.logger.debug(
        `Payout period ${payoutPeriod.id} has unconfirmed blocks, skipping payout`,
      )
      return
    }

    // Get the batch of addresses to be paid out and their associated share count
    const payoutAddresses = await this.db.payoutAddresses(payoutPeriod.id)

    // Get the total amount earned during the payout (and associated previous payouts)
    const totalPayoutReward = await this.db.getPayoutReward(payoutPeriod.id)

    if (totalPayoutReward === 0n) {
      // The shares in this period cannot be paid out since no reward exists
      await this.db.deleteUnpayableShares(payoutPeriod.id)
      return
    }

    // Subtract the amount of recipients since that's how we estimate a
    // transaction fee right now. If we move to use the fee estimator, we will
    // need to update this logic as well.
    // It is worth noting that this leads to slightly inconsistent payout
    // amounts, since 1 payout may have 250 recipients and another may have 5,
    // but considering 1 block reward is 2 billion ORE, it is a trivial
    // difference.
    const feeAmount = BigInt(payoutAddresses.length)
    const totalPayoutAmount = totalPayoutReward - feeAmount

    // Get the total amount of shares submitted during the period
    const totalShareCount = await this.db.payoutPeriodShareCount(payoutPeriod.id)

    // Get the amount that each share earned during this period
    // (total reward - fee) / total share count
    const amountPerShare = totalPayoutAmount / BigInt(totalShareCount)

    // The total balance required to send this payout
    // (total shares * amount per share) + fee
    const totalRequired = amountPerShare * BigInt(totalShareCount) + feeAmount

    // Sanity assertion to make sure the pool is not overpaying
    Assert.isTrue(
      totalPayoutReward >= totalRequired,
      'Payout total must be less than or equal to the total reward amount',
    )

    const hasEnoughBalance = await this.hasAvailableBalance(totalRequired)
    if (!hasEnoughBalance) {
      this.logger.info('Insufficient funds for payout, skipping.')
      return
    }

    let sharesInPayout = 0

    const assetId = Asset.nativeId().toString('hex')
    const outputs: {
      publicAddress: string
      amount: string
      memo: string
      assetId: string
    }[] = []
    for (const payout of payoutAddresses) {
      sharesInPayout += payout.shareCount
      const amount = amountPerShare * BigInt(payout.shareCount)
      outputs.push({
        publicAddress: payout.publicAddress,
        amount: CurrencyUtils.encode(amount),
        memo: `${this.poolName} payout ${payoutPeriod.id}`,
        assetId,
      })
    }

    try {
      this.logger.debug(
        `Creating payout for payout period ${payoutPeriod.id}, shares: ${totalShareCount}, outputs: ${outputs.length}`,
      )
      this.webhooks.map((w) => w.poolPayoutStarted(payoutPeriod.id, outputs, sharesInPayout))

      const transactionHash = await this.sendTransaction(outputs)

      const transactionId = await this.db.newTransaction(transactionHash, payoutPeriod.id)
      Assert.isNotUndefined(transactionId)

      const addressesPaidOut = payoutAddresses.map((p) => p.publicAddress)
      await this.db.markSharesPaid(payoutPeriod.id, transactionId, addressesPaidOut)

      this.logger.debug(`Payout succeeded with transaction hash ${transactionHash}`)
      this.webhooks.map((w) =>
        w.poolPayoutSuccess(payoutPeriod.id, transactionHash, outputs, sharesInPayout),
      )
    } catch (e) {
      this.logger.error(`There was an error with the transaction ${ErrorUtils.renderError(e)}`)
      this.webhooks.map((w) => w.poolPayoutError(e))
    }
  }

  async hasAvailableBalance(amount: bigint): Promise<boolean> {
    const balance = await this.rpc.wallet.getAccountBalance({ account: this.accountName })
    const availableBalance = BigInt(balance.content.available)

    return availableBalance >= amount
  }

  async sendTransaction(
    outputs: {
      publicAddress: string
      amount: string
      memo: string
      assetId: string
    }[],
  ): Promise<string> {
    let account = this.accountName

    if (account === undefined) {
      const defaultAccount = await this.rpc.wallet.getDefaultAccount()

      if (!defaultAccount.content.account) {
        throw Error(
          `No account is currently active on the node. Cannot send a payout transaction.`,
        )
      }

      account = defaultAccount.content.account.name
    }

    const transaction = await this.rpc.wallet.sendTransaction({
      account,
      outputs,
      fee: outputs.length.toString(),
      expirationDelta: this.config.get('transactionExpirationDelta'),
    })

    return transaction.content.hash
  }

  async assertAccountExists(): Promise<void> {
    if (this.accountName) {
      const response = await this.rpc.wallet.getAccounts()

      const accountNames = response.content.accounts

      if (accountNames.find((accountName) => accountName === this.accountName) === undefined) {
        throw Error(
          `Cannot send pool payouts from account '${this.accountName}': account not found.`,
        )
      }
    } else {
      const defaultAccount = await this.rpc.wallet.getDefaultAccount()

      if (defaultAccount.content.account === null) {
        throw Error(`Cannot send pool payouts: no account is active on the node.`)
      }
    }
  }
}
