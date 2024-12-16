/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable no-console */
import { LogLevel } from 'consola'
import { Assert } from '../assert'
import { Logger } from '../logger'
import { IDatabaseTransaction } from '../storage/database/transaction'
import { StrEnumUtils } from '../utils'
import { MIGRATIONS } from './data'
import { Database, Migration, MigrationContext } from './migration'

type MigrationStatus = { name: string; applied: boolean }

export class Migrator {
  readonly context: MigrationContext
  readonly logger: Logger
  readonly migrations: Migration[]

  constructor(options: { context: MigrationContext; logger: Logger; databases?: Database[] }) {
    this.context = options.context
    this.logger = options.logger.withTag('migrator')

    const whitelistedDBs = options?.databases ?? StrEnumUtils.getValues(Database)
    this.migrations = MIGRATIONS.map((m) => {
      return new m().init(options.context.files)
    })
      .filter((migration) => whitelistedDBs.includes(migration.database))
      .sort((a, b) => a.id - b.id)
  }

  /**
   * Returns true if any database is at version 0
   */
  async isInitial(): Promise<boolean> {
    for (const migration of this.migrations) {
      if (await this.isEmpty(migration)) {
        return true
      }
    }
    return false
  }

  /**
   * Returns true if the migration database is at version 0
   */
  async isEmpty(migration: Migration): Promise<boolean> {
    const db = await migration.prepare(this.context)

    try {
      await db.open()
      const version = await db.getVersion()
      return version === 0
    } finally {
      await db.close()
    }
  }

  async isApplied(migration: Migration): Promise<boolean> {
    const db = await migration.prepare(this.context)

    try {
      await db.open()
      const version = await db.getVersion()
      return version >= migration.id
    } finally {
      await db.close()
    }
  }

  async revert(options?: { dryRun?: boolean; walletPassphrase?: string }): Promise<void> {
    const dryRun = options?.dryRun ?? false

    const migrations = this.migrations.slice().reverse()

    for (const migration of migrations) {
      const applied = await this.isApplied(migration)

      if (applied) {
        this.logger.info(`Reverting ${migration.name}`)
        const db = await migration.prepare(this.context)

        const childLogger = this.logger.withTag(migration.name)
        let tx: IDatabaseTransaction | null = null

        try {
          await db.open()
          tx = db.transaction()

          await migration.backward(
            this.context,
            db,
            tx,
            childLogger,
            dryRun,
            options?.walletPassphrase,
          )
          await db.putVersion(migration.id - 1, tx)

          if (dryRun) {
            await tx.abort()
          } else {
            await tx.commit()
          }
        } finally {
          await db.close()
        }

        return
      }
    }
  }

  async migrate(options?: {
    quiet?: boolean
    quietNoop?: boolean
    dryRun?: boolean
    walletPassphrase?: string
  }): Promise<void> {
    const dryRun = options?.dryRun ?? false
    const logger = this.logger.create({})

    if (options?.quiet) {
      logger.level = LogLevel.Silent
    }

    const status = new Array<[Migration, boolean]>()
    for (const migration of this.migrations) {
      const applied = await this.isApplied(migration)
      status.push([migration, applied])
    }

    const unapplied = status.filter(([, applied]) => !applied).map(([migration]) => migration)

    if (unapplied.length === 0) {
      if (!options?.quietNoop) {
        logger.info(`All ${this.migrations.length} migrations applied.`)
      }
      return
    }

    logger.info(`Applying ${unapplied.length} migrations${dryRun ? ' in dry run mode' : ''}:`)

    for (const migration of unapplied) {
      logger.info(`  ${migration.name}`)
    }

    logger.info(``)

    for (const migration of unapplied) {
      logger.info(`Running ${migration.name}...`)
      const db = await migration.prepare(this.context)

      const childLogger = logger.withTag(migration.name)
      let tx: IDatabaseTransaction | undefined = undefined

      try {
        await db.open()

        if (dryRun) {
          tx = db.transaction()
        }

        await migration.forward(
          this.context,
          db,
          tx,
          childLogger,
          dryRun,
          options?.walletPassphrase,
        )
        await db.putVersion(migration.id, tx)

        if (dryRun) {
          Assert.isNotUndefined(tx)
          await tx.abort()
          break
        }
      } catch (e) {
        this.logger.error(`Error applying ${migration.name}`)
        throw e
      } finally {
        await db.close()
      }
    }

    logger.info(`Successfully ${dryRun ? 'dry ran' : 'applied'} ${unapplied.length} migrations`)
  }

  async status(): Promise<{
    migrations: MigrationStatus[]
    unapplied: number
  }> {
    let unapplied = 0
    const migrations: MigrationStatus[] = []
    for (const migration of this.migrations) {
      const applied = await this.isApplied(migration)

      migrations.push({
        name: migration.name,
        applied,
      })

      if (!applied) {
        unapplied++
      }
    }

    return {
      migrations,
      unapplied,
    }
  }
}
