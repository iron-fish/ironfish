/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable no-console */
import { Logger } from '../logger'
import { IronfishSdk } from '../sdk'
import { ErrorUtils } from '../utils/error'
import { MIGRATIONS } from './data'
import { Migration } from './migration'

export class Migrator {
  readonly sdk: IronfishSdk
  readonly logger: Logger
  readonly migrations: Migration[]

  constructor(options: { sdk: IronfishSdk; logger: Logger }) {
    this.sdk = options.sdk
    this.logger = options.logger

    this.migrations = MIGRATIONS.map((m) => new m().init()).sort((a, b) => a.id - b.id)
  }

  async isApplied(migration: Migration): Promise<boolean> {
    const db = await migration.prepare(this.sdk)

    try {
      await db.open()
      const version = await db.getVersion()
      return version >= migration.id
    } finally {
      await db.close()
    }
  }

  async revert(): Promise<void> {
    const migrations = Array.from(this.migrations).reverse()

    for (const migration of migrations) {
      const applied = await this.isApplied(migration)

      if (applied) {
        this.logger.info(`Reverting ${migration.name}`)
        const db = await migration.prepare(this.sdk)

        try {
          await db.open()

          await db.transaction(async (tx) => {
            await migration.backward(this.sdk, db, tx)
            await db.putVersion(migration.id - 1, tx)
          })
        } finally {
          await db.close()
        }

        return
      }
    }
  }

  async migrate(options?: { quiet?: boolean; quietNoop?: boolean }): Promise<void> {
    const logger = options?.quiet ? null : this.logger
    const writeOut = options?.quiet ? null : (t: string) => process.stdout.write(t)

    const status = await Promise.all(
      this.migrations.map(async (migration) => {
        const applied = await this.isApplied(migration)
        return [migration, applied] as const
      }),
    )

    const unapplied = status.filter(([, applied]) => !applied).map(([migration]) => migration)

    if (unapplied.length === 0) {
      logger?.info(`All ${this.migrations.length} migrations applied.`)
      return
    }

    logger?.info(`Running ${unapplied.length} migrations:`)

    for (const migration of unapplied) {
      writeOut?.(`  Applying ${migration.name}...`)

      const db = await migration.prepare(this.sdk)

      try {
        await db.open()

        await db.transaction(async (tx) => {
          await migration.forward(this.sdk, db, tx)
          await db.putVersion(migration.id, tx)
        })
      } catch (e) {
        writeOut?.(` ERROR\n`)
        this.logger.error(ErrorUtils.renderError(e, true))
        throw e
      } finally {
        await db.close()
      }

      writeOut?.(` OK\n`)
    }

    if (unapplied.length || !options?.quietNoop) {
      logger?.info(`Successfully ran ${unapplied.length} migrations`)
    }
  }

  async check(): Promise<void> {
    let unapplied = 0

    this.logger.info('Checking migrations:')

    for (const migration of this.migrations) {
      process.stdout.write(`  Checking ${migration.name}...`.padEnd(50, ' '))

      try {
        const applied = await this.isApplied(migration)
        process.stdout.write(` ${applied ? 'APPLIED' : 'WAITING'}\n`)

        if (!applied) {
          unapplied++
        }
      } catch (e) {
        process.stdout.write(` ERROR\n`)
        this.logger.error(ErrorUtils.renderError(e, true))
        throw e
      }
    }

    if (unapplied > 0) {
      this.logger.info('')
      this.logger.info(`You have ${unapplied} unapplied migrations.`)
    }
  }
}
