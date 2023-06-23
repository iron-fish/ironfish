/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Platform } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../command'
import { ConfigFlag, ConfigFlagKey, DataDirFlag, DataDirFlagKey } from '../flags'
import { PlatformUtils } from '../utils'

export class BrowseCommand extends IronfishCommand {
  static description = `Browse to your data directory`

  static flags = {
    [ConfigFlagKey]: ConfigFlag,
    [DataDirFlagKey]: DataDirFlag,
    cd: Flags.boolean({
      default: false,
      description: 'print the directory where the data directory is',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(BrowseCommand)

    const dataDir = this.sdk.fileSystem.resolve(this.sdk.dataDir)

    if (flags.cd) {
      this.log(dataDir)
      this.exit(0)
    }

    this.log('Browsing to ' + dataDir)
    const launched = PlatformUtils.browse(dataDir)

    if (!launched) {
      this.error(`Could not browse to ${dataDir} on ${Platform.getName()}`)
    }
  }
}
