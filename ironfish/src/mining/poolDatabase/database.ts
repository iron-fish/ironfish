/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Database, open } from 'sqlite'
import sqlite3 from 'sqlite3'
import { NodeFileProvider } from '../../fileSystems/nodeFileSystem'

export class PoolDatabase {
  private readonly db: Database
  private readonly attemptPayoutInterval: number
  private readonly successfulPayoutInterval: number

  constructor(options: {
    db: Database
    attemptPayoutInterval: number
    successfulPayoutInterval: number
  }) {
    this.db = options.db
    this.attemptPayoutInterval = options.attemptPayoutInterval
    this.successfulPayoutInterval = options.successfulPayoutInterval
  }

  static async init(options: {
    dataDir: string
    attemptPayoutInterval: number
    successfulPayoutInterval: number
  }): Promise<PoolDatabase> {
    const fs = new NodeFileProvider()
    await fs.init()

    const poolFolder = fs.join(options.dataDir, '/pool')
    await fs.mkdir(poolFolder, { recursive: true })

    const db = await open({
      filename: fs.join(poolFolder, '/database.sqlite'),
      driver: sqlite3.Database,
    })

    return new PoolDatabase({
      db,
      successfulPayoutInterval: options.successfulPayoutInterval,
      attemptPayoutInterval: options.attemptPayoutInterval,
    })
  }

  async start(): Promise<void> {
    await this.db.migrate({ migrationsPath: `${__dirname}/migrations` })
  }

  async stop(): Promise<void> {
    await this.db.close()
  }

  async newShare(publicAddress: string): Promise<void> {
    await this.db.run('INSERT INTO share (publicAddress) VALUES (?)', publicAddress)
  }

  async getSharesForPayout(timestamp: number): Promise<DatabaseShare[]> {
    return await this.db.all(
      "SELECT * FROM share WHERE payoutId IS NULL AND createdAt < datetime(?, 'unixepoch')",
      timestamp,
    )
  }

  async newPayout(timestamp: number): Promise<number | null> {
    // Create a payout row if the most recent succesful payout was greater than the payout interval
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

  async markPayoutSuccess(id: number, timestamp: number): Promise<void> {
    await this.db.run('UPDATE payout SET succeeded = TRUE WHERE id = ?', id)
    await this.db.run(
      "UPDATE share SET payoutId = ? WHERE payoutId IS NULL AND createdAt < datetime(?, 'unixepoch')",
      id,
      timestamp,
    )
  }

  async shareCountSince(timestamp: number): Promise<number> {
    const result = await this.db.get<{ count: number }>(
      "SELECT COUNT(id) AS count FROM share WHERE createdAt > datetime(?, 'unixepoch')",
      timestamp,
    )
    if (result == null) {
      return 0
    }
    return result.count
  }
}

export type DatabaseShare = {
  id: number
  publicAddress: string
  createdAt: Date
  payoutId: number | null
}
