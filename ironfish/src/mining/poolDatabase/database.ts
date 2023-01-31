/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Database, open } from 'sqlite'
import sqlite3 from 'sqlite3'
import { Config } from '../../fileStores/config'
import { NodeFileProvider } from '../../fileSystems/nodeFileSystem'
import { Logger } from '../../logger'
import { Migrator } from './migrator'

export class PoolDatabase {
  private readonly db: Database
  private readonly config: Config
  private readonly migrations: Migrator
  private readonly attemptPayoutInterval: number
  private readonly successfulPayoutInterval: number

  constructor(options: { db: Database; config: Config; logger: Logger }) {
    this.db = options.db
    this.config = options.config
    this.migrations = new Migrator({ db: options.db, logger: options.logger })
    this.attemptPayoutInterval = this.config.get('poolAttemptPayoutInterval')
    this.successfulPayoutInterval = this.config.get('poolSuccessfulPayoutInterval')
  }

  static async init(options: { config: Config; logger: Logger }): Promise<PoolDatabase> {
    const fs = new NodeFileProvider()
    await fs.init()

    const poolFolder = fs.join(options.config.dataDir, '/pool')
    await fs.mkdir(poolFolder, { recursive: true })

    const db = await open({
      filename: fs.join(poolFolder, '/database.sqlite'),
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
    await this.db.run('INSERT INTO share (publicAddress) VALUES (?)', publicAddress)
  }

  async newBlock(sequence: number, hash: string, reward: string): Promise<void> {
    const sql = `
      INSERT INTO block (payoutPeriodId, blockSequence, blockHash, minerReward)
      VALUES (
        (SELECT id FROM payoutPeriod WHERE end IS NULL),
        ?, ?, ?
      )
    `

    await this.db.run(sql, sequence, hash, reward)
  }

  async getSharesForPayout(timestamp: number): Promise<DatabaseShare[]> {
    return await this.db.all(
      "SELECT * FROM share WHERE payoutId IS NULL AND createdAt < datetime(?, 'unixepoch')",
      timestamp,
    )
  }

  async getSharesCountForPayout(publicAddress?: string): Promise<number> {
    let sql = 'SELECT COUNT(*) AS count from share WHERE payoutId IS NULL'

    if (publicAddress) {
      sql += ' AND publicAddress = ?'
    }

    const result = await this.db.get<{ count: number }>(sql, publicAddress)
    if (result === undefined) {
      return 0
    }

    return result.count
  }

  async newPayout(timestamp: number): Promise<number | null> {
    // Create a payout row if the most recent successful payout was greater than the payout interval
    // and the most recent payout was greater than the attempt interval, in case of failed or long
    // running payouts.
    const successfulPayoutCutoff = timestamp - this.successfulPayoutInterval
    const attemptPayoutCutoff = timestamp - this.attemptPayoutInterval

    const query = `
       INSERT INTO payout (succeeded)
         SELECT FALSE WHERE
           NOT EXISTS (SELECT * FROM payout WHERE createdAt > datetime(?, 'unixepoch') AND succeeded = TRUE)
           AND NOT EXISTS (SELECT * FROM payout WHERE createdAt > datetime(?, 'unixepoch'))
     `

    const result = await this.db.run(query, successfulPayoutCutoff, attemptPayoutCutoff)
    if (result.changes !== 0 && result.lastID != null) {
      return result.lastID
    }

    return null
  }

  async markPayoutSuccess(
    id: number,
    timestamp: number,
    transactionHash: string,
  ): Promise<void> {
    await this.db.run(
      'UPDATE payout SET succeeded = TRUE, transactionHash = ? WHERE id = ?',
      id,
      transactionHash,
    )
    await this.db.run(
      "UPDATE share SET payoutId = ? WHERE payoutId IS NULL AND createdAt < datetime(?, 'unixepoch')",
      id,
      timestamp,
    )
  }

  async shareCountSince(timestamp: number, publicAddress?: string): Promise<number> {
    let sql = "SELECT COUNT(id) AS count FROM share WHERE createdAt > datetime(?, 'unixepoch')"

    if (publicAddress) {
      sql += ' AND publicAddress = ?'
    }

    const result = await this.db.get<{ count: number }>(sql, timestamp, publicAddress)
    if (result === undefined) {
      return 0
    }

    return result.count
  }

  async unconfirmedBlocks(): Promise<DatabaseBlock[]> {
    const sql = 'SELECT * FROM block WHERE confirmed = false'

    const rows = await this.db.all<RawDatabaseBlock[]>(sql)

    const result: DatabaseBlock[] = []
    for (const row of rows) {
      result.push(parseDatabaseBlock(row))
    }

    return result
  }

  async updateBlockStatus(blockId: number, main: boolean, confirmed: boolean): Promise<void> {
    await this.db.run(
      'UPDATE block SET main = ?, confirmed = ? WHERE id = ?',
      main,
      confirmed,
      blockId,
    )
  }

  async getCurrentPayoutPeriod(): Promise<DatabasePayoutPeriod | undefined> {
    const period = await this.db.get<DatabasePayoutPeriod>(
      'SELECT * FROM payoutPeriod WHERE end is null',
    )

    return period
  }

  async rolloverPayoutPeriod(timestamp: number): Promise<void> {
    await this.db.run('UPDATE payoutPeriod SET end = ? WHERE end IS NULL', timestamp - 1)
    await this.db.run('INSERT INTO payoutPeriod (start) VALUES (?)', timestamp)
  }
}

export type DatabaseShare = {
  id: number
  publicAddress: string
  createdAt: Date
  payoutId: number | null
}

export type DatabasePayoutPeriod = {
  id: number
  // TODO: Look into why this creates a string instead of a timestamp like start and end
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
}

interface RawDatabaseBlock {
  id: number
  createdAt: string
  blockSequence: number
  blockHash: string
  minerReward: string
  confirmed: number
  main: number
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
  }
}
