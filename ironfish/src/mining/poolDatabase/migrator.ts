/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable no-console */
import { LogLevel } from 'consola'
import { Database } from 'sqlite'
import { Logger } from '../../logger'
import { Migration } from './migration'
import { MIGRATIONS } from './migrations'

export class Migrator {
  readonly db: Database
  readonly logger: Logger
  readonly migrations: Migration[]

  constructor(options: { db: Database; logger: Logger }) {
    this.db = options.db
    this.logger = options.logger

    this.migrations = MIGRATIONS.map((m) => new m().init()).sort((a, b) => a.id - b.id)
  }

  async getCurrentId(): Promise<number> {
    const pragma = await this.db.get<{ user_version: number }>('PRAGMA user_version;')
    return pragma?.user_version ?? 0
  }

  getLatest(): Migration | null {
    return this.migrations[this.migrations.length - 1] ?? null
  }

  async migrated(): Promise<boolean> {
    const latest = this.getLatest()
    if (latest === null) {
      return true
    }

    const current = await this.getCurrentId()
    return latest.id <= current
  }

  async migrate(): Promise<void> {
    if (await this.migrated()) {
      return
    }

    const current = await this.getCurrentId()
    const unapplied = this.migrations.filter((a) => a.id > current)

    try {
      await this.db.run('begin transaction')
      this.logger.info('Running migrations:')

      for (const migration of unapplied) {
        this.write(`  Applying ${migration.name}...`)

        try {
          await migration.forward(this.db)
          await this.db.run(`PRAGMA user_version = ${migration.id};`)
        } catch (e) {
          this.write(` ERROR\n`)
          console.error(e)
          throw e
        }
        this.write(` OK\n`)
      }

      await this.db.run('COMMIT;')
      this.logger.info(`Successfully ran ${unapplied.length} migrations`)
    } catch (e) {
      await this.db.run('ROLLBACK;').catch(() => {
        /* do nothing */
      })
      throw e
    }
  }

  write(output: string): void {
    if (this.logger.level >= LogLevel.Info) {
      process.stdout.write(output)
    }
  }
}
