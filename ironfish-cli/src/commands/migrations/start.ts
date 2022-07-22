/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IronfishCommand } from '../../command'
import { ConfigFlag, ConfigFlagKey, DataDirFlag, DataDirFlagKey } from '../../flags'

export class StartCommand extends IronfishCommand {
  static description = `Run migrations`

  static flags = {
    [ConfigFlagKey]: ConfigFlag,
    [DataDirFlagKey]: DataDirFlag,
  }

  async start(): Promise<void> {
    await this.parse(StartCommand)

    console.log('foo 1')
    const node = await this.sdk.node()
    console.log('foo 2')
    await node.migrator.migrate()
    console.log('foo 3')

    this.exit(0)
  }
}
