/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { ConfigFlag, ConfigFlagKey, DataDirFlag, DataDirFlagKey, LocalFlags } from '../../flags'

export class StartCommand extends IronfishCommand {
  static description = `Run migrations`

  static flags = {
    ...LocalFlags,
    [ConfigFlagKey]: ConfigFlag,
    [DataDirFlagKey]: DataDirFlag,
    dry: Flags.boolean({
      default: false,
      description: 'Dry run migrations first',
    }),
    quiet: Flags.boolean({
      char: 'q',
      default: false,
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(StartCommand)

    const node = await this.sdk.node()
    await node.migrator.migrate({ quiet: flags.quiet, dryRun: flags.dry })
  }
}
