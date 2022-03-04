/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Database, open } from 'sqlite'
import sqlite3 from 'sqlite3'

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

export class MiningPoolShares {
  private readonly db: SharesDatabase
  private recentShares: Share[]

  constructor(db: SharesDatabase) {
    this.db = db
    this.recentShares = []
  }

  static async init(): Promise<MiningPoolShares> {
    const db = await SharesDatabase.init()
    return new MiningPoolShares(db)
  }

  async start(): Promise<void> {
    await this.db.start()
  }

  async stop(): Promise<void> {
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
    if (found != null) {
      return true
    }
    return false
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
}

class SharesDatabase {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
  }

  static async init(): Promise<SharesDatabase> {
    // TODO: $DATADIR/pool/database.sqlite
    const db = await open({
      filename: './foo.db',
      driver: sqlite3.Database,
    })
    return new SharesDatabase(db)
  }

  async start(): Promise<void> {
    // TODO: Copy these into build folder or find a better solution
    await this.db.migrate({ migrationsPath: '../ironfish/src/miningNew/migrations' })
  }

  async stop(): Promise<void> {
    await this.db.close()
  }

  async newShare(publicAddress: string) {
    await this.db.run('INSERT INTO share (public_address) VALUES (?)', publicAddress)
  }
}

type Share = {
  timestamp: Date
  publicAddress: string
  miningRequestId: number
  randomness: number
}
