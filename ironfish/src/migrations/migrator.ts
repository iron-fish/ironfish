/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable no-console */
import { Logger } from '../logger'
import { IronfishNode } from '../node'
import { ErrorUtils } from '../utils/error'
import { MIGRATIONS } from './data'
import { Migration } from './migration'

export class Migrator {
  readonly node: IronfishNode
  readonly logger: Logger
  readonly migrations: Migration[]

  constructor(options: { node: IronfishNode; logger: Logger }) {
    this.node = options.node
    this.logger = options.logger

    this.migrations = MIGRATIONS.map((m) => new m().init(options.node.files)).sort(
      (a, b) => a.id - b.id,
    )
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
    const db = await migration.prepare(this.node)

    try {
      await db.open()
      const version = await db.getVersion()
      return version === 0
    } finally {
      await db.close()
    }
  }

  async isApplied(migration: Migration): Promise<boolean> {
    const db = await migration.prepare(this.node)

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
        const db = await migration.prepare(this.node)

        try {
          await db.open()

          await db.transaction(async (tx) => {
            await migration.backward(this.node, db, tx)
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

    const status = new Array<[Migration, boolean]>()
    for (const migration of this.migrations) {
      const applied = await this.isApplied(migration)
      status.push([migration, applied])
    }

    const unapplied = status.filter(([, applied]) => !applied).map(([migration]) => migration)

    if (unapplied.length === 0) {
      if (!options?.quietNoop) {
        logger?.info(`All ${this.migrations.length} migrations applied.`)
      }
      return
    }

    logger?.info(`Running ${unapplied.length} migrations:`)

    for (const migration of unapplied) {
      console.log('foo 4', migration.name)
      writeOut?.(`  Applying ${migration.name}...`)

      const db = await migration.prepare(this.node)

      try {
        await db.open()

        await db.transaction(async (tx) => {
          await migration.forward(this.node, db, tx)
          await db.putVersion(migration.id, tx)
        })
      } catch (e) {
        writeOut?.(` ERROR\n`)
        throw e
      } finally {
        await db.close()
      }

      writeOut?.(` OK\n`)
    }

    logger?.info(`Successfully ran ${unapplied.length} migrations`)
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
