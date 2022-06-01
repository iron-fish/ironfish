/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Database, open } from 'sqlite'
import sqlite3 from 'sqlite3'
import { NodeFileProvider } from '../fileSystems'
import { LogArgs } from './index'

export class LogsDatabase {
  private db: Database
  private createdTables: string[] = []

  constructor(db: Database) {
    this.db = db
  }

  static async init(dataDir: string): Promise<LogsDatabase> {
    const fs = new NodeFileProvider()
    await fs.init()

    const logsDBFolder = fs.join(dataDir, 'logs')
    await fs.mkdir(logsDBFolder, { recursive: true })

    const db = await open({
      filename: fs.join(logsDBFolder, `/${Date.now()}-database.sqlite`),
      driver: sqlite3.Database,
    })

    return new LogsDatabase(db)
  }

  private async createTableIfNotExists(tableName: string, entry: LogArgs) {
    const existingTable: string | undefined = await this.db.get(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?;`,
      tableName,
    )

    // First check that the table does not already exist
    if (this.createdTables.includes(tableName) || existingTable === tableName) {
      return
    }

    const rows = Object.keys(entry)
      .map((k) => {
        switch (typeof entry[k]) {
          case 'string':
            return `${k} STRING`
          case 'boolean':
            return `${k} BOOLEAN`
          case 'number':
            return `${k} INTEGER`
          default:
            return undefined
        }
      })
      .filter((r) => r !== undefined)

    const statement =
      `CREATE TABLE ${tableName}` + `(id INTEGER PRIMARY KEY, ${rows.join(', ')});`

    await this.db.run(statement)
    this.createdTables.push(tableName)
  }

  // **NOT SECURE** for SQL injection but only using for logs
  async insert(entry: LogArgs, tableName: string): Promise<void> {
    await this.createTableIfNotExists(tableName, entry)
    const keys = Object.keys(entry)

    const statement =
      `INSERT INTO ${tableName}` +
      `(${keys.join(',')})` +
      `VALUES (${keys.map((_) => '?').join(', ')})`

    await this.db.run(statement, ...Object.values(entry))
  }

  async stop(): Promise<void> {
    await this.db.close()
  }
}
