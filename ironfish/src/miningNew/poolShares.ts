/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRootLogger, Logger } from '../logger'
import { IronfishIpcClient } from '../rpc/clients/ipcClient'
import { BigIntUtils } from '../utils/bigint'
import { MapUtils } from '../utils/map'
import { SetTimeoutToken } from '../utils/types'
import { DatabaseShare, SharesDatabase } from './sharesDatabase'

/*
  - Payout can be really simple
    - Simplest: just payout full block amount (reward + fees) when confirmed
    - Slightly less simple: 20% of the wallet's _confirmed_ value whenever a block is confirmed
      - This disincentivizes burst-mining a little bit, while keeping some simplicity
      - Feels like a future improvement as needed
    - Payout proportionally to the amount of shares submitted since:
      - last found/confirmed block
      - last payout? This might be simpler actually or are these basically the same thing
  - Track found block confirmations (so we aren't paying out on forked blocks)
    - Minimal info needed to track this: hash, sequence, confirmations, is-paid-out
  - Shares associated with buckets
    - Simplest: start a new shares bucket whenever we find OR confirm a block (pick one)
      - Not ideal for miners since still relies on luck, but eh, simple.
    - Minimal info needed to track this: 
      - block-hash (or sequence, or whatever "bucket" identifier), payout-address, share-count, is-paid-out
  - The current shares array is not ideal
    - Useful for:
      - Verifying miners aren't submitted duplicate shares
        - For this, we only need to store shares submitted against the latest miningRequestId
      - Easy way to look at hashrate / share count
        - For this, we only need x hours, but having persisted data would also be pretty easy to work with
    - Not ideal for:
      - Payout
      - Persistence
*/

/*
  TL;DR:
  Persist using simple sqlite
  Simple payout on x hour interval, if we just use 10-20% of the wallet, we can even avoid waiting for confirms
  Bucket by payout timestamp? Should be pretty simple
*/

// const OLD_SHARE_CUTOFF_SECONDS = 60 * 60 // 1 hour
const OLD_SHARE_CUTOFF_SECONDS = 60 // 1 minute
const OLD_SHARE_CUTOFF_MILLISECONDS = OLD_SHARE_CUTOFF_SECONDS * 1000

const SUCCESSFUL_PAYOUT_INTERVAL = 2 * 60 * 60 // 2 hours
const ATTEMPT_PAYOUT_INTERVAL = 15 * 60 // 15 minutes

const PAYOUT_BALANCE_PERCENTAGE_DIVISOR = BigInt(10)
const ACCOUNT_NAME = 'default'

export class MiningPoolShares {
  readonly rpc: IronfishIpcClient
  readonly logger: Logger

  private readonly db: SharesDatabase
  private recentShares: Share[]
  private payoutInterval: SetTimeoutToken | null

  private poolName: string

  constructor(options: {
    db: SharesDatabase
    rpc: IronfishIpcClient
    logger?: Logger
    poolName: string
  }) {
    this.db = options.db
    this.rpc = options.rpc
    this.logger = options.logger ?? createRootLogger()
    this.poolName = options.poolName

    this.recentShares = []
    this.payoutInterval = null
  }

  static async init(options: {
    rpc: IronfishIpcClient
    logger?: Logger
    poolName: string
  }): Promise<MiningPoolShares> {
    const db = await SharesDatabase.init({
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

  async submitShare(
    publicAddress: string,
    miningRequestId: number,
    randomness: number,
  ): Promise<void> {
    if (this.hasShare(publicAddress, miningRequestId, randomness)) {
      return
    }

    this.truncateOldShares()

    this.recentShares.push({
      timestamp: new Date(),
      publicAddress,
      miningRequestId,
      randomness,
    })

    await this.db.newShare(publicAddress)
  }

  hasShare(publicAddress: string, miningRequestId: number, randomness: number): boolean {
    const found = this.recentShares.find(
      (el) =>
        el.miningRequestId === miningRequestId &&
        el.randomness === randomness &&
        el.publicAddress === publicAddress,
    )

    return found !== undefined
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

  shareRate(): number {
    return this.recentShareCount() / OLD_SHARE_CUTOFF_SECONDS
  }

  minerShareRate(publicAddress: string): number {
    return this.publicAddressRecentShareCount(publicAddress) / OLD_SHARE_CUTOFF_SECONDS
  }

  private truncateOldShares(): void {
    const timeCutoff = new Date(new Date().getTime() - OLD_SHARE_CUTOFF_MILLISECONDS)
    this.recentShares = this.recentShares.filter((share) => share.timestamp > timeCutoff)
  }

  private recentShareCount(): number {
    return this.recentShares.length
  }

  private publicAddressRecentShareCount(publicAddress: string): number {
    return this.recentShares.filter((share) => share.publicAddress === publicAddress).length
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

type Share = {
  timestamp: Date
  publicAddress: string
  miningRequestId: number
  randomness: number
}
