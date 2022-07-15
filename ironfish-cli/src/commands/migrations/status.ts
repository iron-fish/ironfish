/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Migrator } from '@ironfish/sdk'
import { IronfishCommand } from '../../command'
import { ConfigFlag, ConfigFlagKey, DataDirFlag, DataDirFlagKey } from '../../flags'

export class StatusCommand extends IronfishCommand {
  static description = `Run migrations`

  static flags = {
    [ConfigFlagKey]: ConfigFlag,
    [DataDirFlagKey]: DataDirFlag,
  }

  async start(): Promise<void> {
    await this.parse(StatusCommand)

    const migrator = new Migrator({ sdk: this.sdk, logger: this.logger })
    await migrator.check()
  }
}
