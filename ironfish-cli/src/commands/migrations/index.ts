/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { DatabaseIsLockedError, DatabaseOpenError, ErrorUtils } from '@ironfish/sdk'
import { IronfishCommand } from '../../command'
import { JsonFlags } from '../../flags'
import * as ui from '../../ui'

export class StatusCommand extends IronfishCommand {
  static description = `list data migrations and their status`
  static enableJsonFlag = true

  static flags = {
    ...JsonFlags,
  }

  async start(): Promise<unknown> {
    await this.parse(StatusCommand)

    const node = await this.sdk.node()

    let migrationsStatus
    try {
      migrationsStatus = await node.migrator.status()
    } catch (e) {
      if (e instanceof DatabaseIsLockedError || e instanceof DatabaseOpenError) {
        this.logToStderr('Database in use, cannot check status of migrations.')
      } else {
        this.logToStderr(' ERROR\n')
        this.logToStderr(ErrorUtils.renderError(e, true))
      }

      this.exit(1)
    }

    const displayData: Record<string, string> = {}
    for (const { name, applied } of migrationsStatus.migrations) {
      displayData[name] = applied ? 'APPLIED' : 'WAITING'
    }

    this.log(ui.card(displayData))

    this.log(`\nYou have ${migrationsStatus.unapplied} unapplied migrations.`)

    return migrationsStatus
  }
}
