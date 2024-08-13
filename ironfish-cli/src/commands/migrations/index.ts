/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NodeUtils } from '@ironfish/sdk'
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

    // Verify the DB is in a state to be opened by the migrator
    await NodeUtils.waitForOpen(node)
    await node.closeDB()

    const migrationsStatus = await node.migrator.status()

    const displayData: Record<string, string> = {}
    for (const { name, applied } of migrationsStatus.migrations) {
      displayData[name] = applied ? 'APPLIED' : 'WAITING'
    }

    this.log(ui.card(displayData))

    this.log(`\nYou have ${migrationsStatus.unapplied} unapplied migrations.`)

    return migrationsStatus
  }
}
