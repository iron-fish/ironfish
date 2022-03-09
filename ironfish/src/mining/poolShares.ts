/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRootLogger, Logger } from '../logger'
import { IronfishIpcClient } from '../rpc/clients/ipcClient'
import { BigIntUtils } from '../utils/bigint'
import { MapUtils } from '../utils/map'
import { SetTimeoutToken } from '../utils/types'
import { DatabaseShare, PoolDatabase } from './poolDatabase'

const RECENT_SHARE_CUTOFF = 10 * 60 // 10 minutes

const SUCCESSFUL_PAYOUT_INTERVAL = 2 * 60 * 60 // 2 hours
const ATTEMPT_PAYOUT_INTERVAL = 15 * 60 // 15 minutes

const PAYOUT_BALANCE_PERCENTAGE_DIVISOR = BigInt(10)
const ACCOUNT_NAME = 'default'

export class MiningPoolShares {
  readonly rpc: IronfishIpcClient
  readonly logger: Logger

  private readonly db: PoolDatabase
  private payoutInterval: SetTimeoutToken | null

  private poolName: string

  constructor(options: {
    db: PoolDatabase
    rpc: IronfishIpcClient
    logger?: Logger
    poolName: string
  }) {
    this.db = options.db
    this.rpc = options.rpc
    this.logger = options.logger ?? createRootLogger()
    this.poolName = options.poolName

    this.payoutInterval = null
  }

  static async init(options: {
    rpc: IronfishIpcClient
    dataDir: string
    logger?: Logger
    poolName: string
  }): Promise<MiningPoolShares> {
    const db = await PoolDatabase.init({
      dataDir: options.dataDir,
      successfulPayoutInterval: SUCCESSFUL_PAYOUT_INTERVAL,
      attemptPayoutInterval: ATTEMPT_PAYOUT_INTERVAL,
    })

    return new MiningPoolShares({
      db,
      rpc: options.rpc,
      logger: options.logger,
      poolName: options.poolName,
    })
  }

  async start(): Promise<void> {
    this.startPayoutInterval()
    await this.db.start()
  }

  async stop(): Promise<void> {
    this.stopPayoutInterval()
    await this.db.stop()
  }

  async submitShare(publicAddress: string): Promise<void> {
    await this.db.newShare(publicAddress)
  }

  async createPayout(): Promise<void> {
    // TODO: Make a max payout amount per transaction
    //   - its currently possible to have a payout include so many inputs that it expires before it
    //     gets added to the mempool. suspect this would cause issues elsewhere
    //  As a simple stop-gap, we could probably make payout interval = every x hours OR if confirmed balance > 200 or something
    //  OR we could combine them, every x minutes, pay 10 inputs into 1 output?

    // Since timestamps have a 1 second granularity, make the cutoff 1 second ago, just to avoid potential issues
    const shareCutoff = new Date()
    shareCutoff.setSeconds(shareCutoff.getSeconds() - 1)
    const timestamp = Math.floor(shareCutoff.getTime() / 1000)

    // Create a payout in the DB as a form of a lock
    const payoutId = await this.db.newPayout(timestamp)
    if (payoutId == null) {
      this.logger.info(
        'Another payout may be in progress or a payout was made too recently, skipping.',
      )
      return
    }

    const shares = await this.db.getSharesForPayout(timestamp)
    const shareCounts = this.sumShares(shares)

    if (shareCounts.totalShares === 0) {
      this.logger.info('No shares submitted since last payout, skipping.')
      return
    }

    const balance = await this.rpc.getAccountBalance({ account: ACCOUNT_NAME })
    const confirmedBalance = BigInt(balance.content.confirmed)

    const payoutAmount = BigIntUtils.divide(confirmedBalance, PAYOUT_BALANCE_PERCENTAGE_DIVISOR)

    if (payoutAmount <= shareCounts.totalShares + shareCounts.shares.size) {
      // If the pool cannot pay out at least 1 ORE per share and pay transaction fees, no payout can be made.
      this.logger.info('Insufficient funds for payout, skipping.')
      return
    }

    const transactionReceives = MapUtils.map(
      shareCounts.shares,
      (shareCount, publicAddress) => {
        const payoutPercentage = shareCount / shareCounts.totalShares
        const amt = Math.floor(payoutPercentage * payoutAmount)

        return {
          publicAddress,
          amount: amt.toString(),
          memo: `${this.poolName} payout ${shareCutoff.toUTCString()}`,
        }
      },
    )

    // TODO: Non 200 here will throw
    const response = await this.rpc.sendTransaction({
      fromAccountName: ACCOUNT_NAME,
      receives: transactionReceives,
      fee: transactionReceives.length.toString(),
    })
    if (response.status === 200) {
      await this.db.markPayoutSuccess(payoutId, timestamp)
    } else {
      this.logger.error('There was an error with the transaction', response)
    }
  }

  sumShares(shares: DatabaseShare[]): { totalShares: number; shares: Map<string, number> } {
    let totalShares = 0
    const shareMap = new Map<string, number>()
    shares.forEach((share) => {
      const address = share.publicAddress
      const shareCount = shareMap.get(address)
      if (shareCount != null) {
        shareMap.set(address, shareCount + 1)
      } else {
        shareMap.set(address, 1)
      }
      totalShares += 1
    })
    return {
      totalShares,
      shares: shareMap,
    }
  }

  async shareRate(): Promise<number> {
    return (await this.recentShareCount()) / RECENT_SHARE_CUTOFF
  }

  private async recentShareCount(): Promise<number> {
    const timestamp = Math.floor(new Date().getTime() / 1000) - RECENT_SHARE_CUTOFF
    return await this.db.shareCountSince(timestamp)
  }

  private startPayoutInterval() {
    this.payoutInterval = setInterval(() => {
      void this.createPayout()
    }, ATTEMPT_PAYOUT_INTERVAL * 1000)
  }

  private stopPayoutInterval() {
    if (this.payoutInterval) {
      clearInterval(this.payoutInterval)
    }
  }
}
