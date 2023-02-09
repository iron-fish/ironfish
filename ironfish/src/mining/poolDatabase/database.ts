/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Database, open } from 'sqlite'
import sqlite3 from 'sqlite3'
import { Assert } from '../../assert'
import { Config } from '../../fileStores/config'
import { NodeFileProvider } from '../../fileSystems/nodeFileSystem'
import { Logger } from '../../logger'
import { Migrator } from './migrator'

const PREVIOUS_PAYOUT_PERIODS = 3
const MAX_ADDRESSES_PER_PAYOUT = 250

export class PoolDatabase {
  private readonly db: Database
  private readonly migrations: Migrator

  constructor(options: { db: Database; config: Config; logger: Logger }) {
    this.db = options.db
    this.migrations = new Migrator({ db: options.db, logger: options.logger })
  }

  static async init(options: {
    config: Config
    logger: Logger
    dbPath?: string
  }): Promise<PoolDatabase> {
    const fs = new NodeFileProvider()
    await fs.init()

    const poolFolder = fs.join(options.config.dataDir, '/pool')
    await fs.mkdir(poolFolder, { recursive: true })

    const db = await open({
      filename: options.dbPath || fs.join(poolFolder, '/database.sqlite'),
      driver: sqlite3.Database,
    })

    return new PoolDatabase({
      db,
      logger: options.logger,
      config: options.config,
    })
  }

  async start(): Promise<void> {
    await this.migrations.migrate()
  }

  async stop(): Promise<void> {
    await this.db.close()
  }

  async newShare(publicAddress: string): Promise<void> {
    const sql = `
      INSERT INTO payoutShare (payoutPeriodId, publicAddress)
      VALUES (
        (SELECT id FROM payoutPeriod WHERE end IS NULL),
        ?
      )
    `
    await this.db.run(sql, publicAddress)
  }

  async shareCountSince(timestamp: number, publicAddress?: string): Promise<number> {
    // JS timestamps have millisecond resolution, sqlite timestamps have second resolution
    const sqlTimestamp = Math.floor(timestamp / 1000)

    let sql =
      "SELECT COUNT(id) AS count FROM payoutShare WHERE createdAt > datetime(?, 'unixepoch')"

    if (publicAddress) {
      sql += ' AND publicAddress = ?'
    }

    const result = await this.db.get<{ count: number }>(sql, sqlTimestamp, publicAddress)
    if (result === undefined) {
      return 0
    }

    return result.count
  }

  async getCurrentPayoutPeriod(): Promise<DatabasePayoutPeriod | undefined> {
    return await this.db.get<DatabasePayoutPeriod>(
      'SELECT * FROM payoutPeriod WHERE end is null',
    )
  }

  async rolloverPayoutPeriod(timestamp: number): Promise<void> {
    await this.db.run('BEGIN')
    await this.db.run('UPDATE payoutPeriod SET end = ? WHERE end IS NULL', timestamp - 1)
    await this.db.run('INSERT INTO payoutPeriod (start) VALUES (?)', timestamp)
    await this.db.run('COMMIT')
  }

  async newBlock(sequence: number, hash: string, reward: string): Promise<number | undefined> {
    const sql = `
      INSERT INTO block (payoutPeriodId, blockSequence, blockHash, minerReward)
      VALUES (
        (SELECT id FROM payoutPeriod WHERE end IS NULL),
        ?, ?, ?
      )
    `

    const result = await this.db.run(sql, sequence, hash, reward)
    return result.lastID
  }

  async unconfirmedBlocks(): Promise<DatabaseBlock[]> {
    const rows = await this.db.all<RawDatabaseBlock[]>(
      'SELECT * FROM block WHERE confirmed = FALSE',
    )

    const results: DatabaseBlock[] = []
    for (const row of rows) {
      results.push(parseDatabaseBlock(row))
    }

    return results
  }

  async updateBlockStatus(blockId: number, main: boolean, confirmed: boolean): Promise<void> {
    await this.db.run(
      'UPDATE block SET main = ?, confirmed = ? WHERE id = ?',
      main,
      confirmed,
      blockId,
    )
  }

  async newTransaction(hash: string, payoutPeriodId: number): Promise<number | undefined> {
    const result = await this.db.run(
      'INSERT INTO payoutTransaction (transactionHash, payoutPeriodId) VALUES (?, ?)',
      hash,
      payoutPeriodId,
    )

    return result.lastID
  }

  async unconfirmedTransactions(): Promise<DatabasePayoutTransaction[]> {
    const rows = await this.db.all<RawDatabasePayoutTransaction[]>(
      'SELECT * FROM payoutTransaction WHERE confirmed = FALSE AND expired = FALSE',
    )

    const result: DatabasePayoutTransaction[] = []
    for (const row of rows) {
      result.push(parseDatabasePayoutTransaction(row))
    }

    return result
  }

  async updateTransactionStatus(
    transactionId: number,
    confirmed: boolean,
    expired: boolean,
  ): Promise<void> {
    await this.db.run(
      'UPDATE payoutTransaction SET confirmed = ?, expired = ? WHERE id = ?',
      confirmed,
      expired,
      transactionId,
    )
  }

  // Returns a capped number of unique public addresses and the amount of shares
  // they earned for a specific payout period
  async payoutAddresses(
    payoutPeriodId: number,
  ): Promise<{ publicAddress: string; shareCount: number }[]> {
    const sql = `
      SELECT publicAddress, COUNT(id) shareCount
      FROM payoutShare
      WHERE
        payoutPeriodId = ?
        AND payoutTransactionId IS NULL
      GROUP BY publicAddress
      LIMIT ?
    `
    return await this.db.all<{ publicAddress: string; shareCount: number }[]>(
      sql,
      payoutPeriodId,
      MAX_ADDRESSES_PER_PAYOUT,
    )
  }

  async markSharesPaid(
    payoutPeriodId: number,
    payoutTransactionId: number,
    publicAddresses: string[],
  ): Promise<void> {
    Assert.isGreaterThan(
      publicAddresses.length,
      0,
      'markSharesPaid must be called with at least 1 address',
    )

    const sql = `
      UPDATE payoutShare
      SET payoutTransactionId = ?
      WHERE
        payoutPeriodId = ?
        AND publicAddress IN ('${publicAddresses.join("','")}')
    `

    await this.db.run(sql, payoutTransactionId, payoutPeriodId)
  }

  async markSharesUnpaid(transactionId: number): Promise<void> {
    await this.db.run(
      'UPDATE payoutShare SET payoutTransactionId = NULL WHERE payoutTransactionId = ?',
      transactionId,
    )
  }

  async deleteUnpayableShares(payoutPeriodId: number): Promise<void> {
    await this.db.run('DELETE FROM payoutShare WHERE payoutPeriodId = ?', payoutPeriodId)
  }

  async earliestOutstandingPayoutPeriod(): Promise<DatabasePayoutPeriod | undefined> {
    const sql = `
      SELECT * FROM payoutPeriod WHERE id = (
        SELECT payoutPeriodId FROM payoutShare WHERE payoutTransactionId IS NULL ORDER BY id LIMIT 1
      ) AND end IS NOT NULL
    `
    return await this.db.get<DatabasePayoutPeriod>(sql)
  }

  async payoutPeriodShareCount(payoutPeriodId: number): Promise<number> {
    const result = await this.db.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM payoutShare WHERE payoutPeriodId = ?',
      payoutPeriodId,
    )
    if (result === undefined) {
      return 0
    }

    return result.count
  }

  // Returns the shares that have not been paid out independent of payout period
  async pendingShareCount(publicAddress?: string): Promise<number> {
    let sql = 'SELECT COUNT(*) AS count FROM payoutShare WHERE payoutTransactionId IS NULL'

    if (publicAddress) {
      sql += ' AND publicAddress = ?'
    }

    const result = await this.db.get<{ count: number }>(sql, publicAddress)

    if (result === undefined) {
      return 0
    }
    return result.count
  }

  // Returns the total payout reward for a specific payout period
  async getPayoutReward(payoutPeriodId: number): Promise<bigint> {
    const sql = `
      SELECT
        *,
        (SELECT SUM(minerReward) FROM block
          WHERE
            payoutPeriodId = payoutPeriod.id
            AND confirmed = TRUE
            AND main = TRUE
        ) reward
      FROM payoutPeriod
      WHERE id BETWEEN ? AND ?
    `

    const results = await this.db.all<Array<DatabasePayoutPeriod & { reward: string | null }>>(
      sql,
      payoutPeriodId - PREVIOUS_PAYOUT_PERIODS,
      payoutPeriodId,
    )

    const percentAmount = {
      [payoutPeriodId]: BigInt(50), // 50% of payout period x
      [payoutPeriodId - 1]: BigInt(25), // 25% of payout period x-1
      [payoutPeriodId - 2]: BigInt(15), // 15% of payout period x-2
      [payoutPeriodId - 3]: BigInt(10), // 10% of payout period x-3
    }

    // Safety check in case the associated const is changed
    Assert.isEqual(
      PREVIOUS_PAYOUT_PERIODS + 1,
      Object.keys(percentAmount).length,
      'Payout period percent amount needs to have a value for each period',
    )

    let totalReward = BigInt(0)
    for (const result of results) {
      const reward = BigInt(result.reward || '0')
      const amount = (reward * percentAmount[result.id]) / BigInt(100)
      totalReward += amount
    }

    return totalReward
  }

  // Checks the related payouts (the given payout period and the payouts within
  // PREVIOUS_PAYOUT_PERIODS) to see if any of them have unconfirmed blocks
  async payoutPeriodBlocksConfirmed(payoutPeriodId: number): Promise<boolean> {
    const sql = `
      SELECT *
      FROM block
      WHERE
        payoutPeriodId BETWEEN ? AND ?
        AND confirmed = FALSE
    `
    const results = await this.db.all<DatabasePayoutPeriod[]>(
      sql,
      payoutPeriodId - PREVIOUS_PAYOUT_PERIODS,
      payoutPeriodId,
    )

    if (results.length > 0) {
      return false
    }

    return true
  }
}

export type DatabasePayoutPeriod = {
  id: number
  // TODO(mat): Look into why this creates a string instead of a timestamp like start and end
  createdAt: string
  start: number
  end: number | null
}

export type DatabaseBlock = {
  id: number
  createdAt: Date
  blockSequence: number
  blockHash: string
  minerReward: bigint
  confirmed: boolean
  main: boolean
  payoutPeriodId: number
}

export interface RawDatabaseBlock {
  id: number
  createdAt: string
  blockSequence: number
  blockHash: string
  minerReward: string
  confirmed: number
  main: number
  payoutPeriodId: number
}

function parseDatabaseBlock(rawBlock: RawDatabaseBlock): DatabaseBlock {
  return {
    id: rawBlock.id,
    createdAt: new Date(rawBlock.createdAt),
    blockSequence: rawBlock.blockSequence,
    blockHash: rawBlock.blockHash,
    minerReward: BigInt(rawBlock.minerReward),
    confirmed: Boolean(rawBlock.confirmed),
    main: Boolean(rawBlock.main),
    payoutPeriodId: rawBlock.payoutPeriodId,
  }
}

export type DatabasePayoutTransaction = {
  id: number
  createdAt: Date
  transactionHash: string
  confirmed: boolean
  expired: boolean
  payoutPeriodId: number
}

export interface RawDatabasePayoutTransaction {
  id: number
  createdAt: string
  transactionHash: string
  confirmed: number
  expired: number
  payoutPeriodId: number
}

function parseDatabasePayoutTransaction(rawTransaction: RawDatabasePayoutTransaction) {
  return {
    id: rawTransaction.id,
    createdAt: new Date(rawTransaction.createdAt),
    transactionHash: rawTransaction.transactionHash,
    confirmed: Boolean(rawTransaction.confirmed),
    expired: Boolean(rawTransaction.expired),
    payoutPeriodId: rawTransaction.payoutPeriodId,
  }
}
