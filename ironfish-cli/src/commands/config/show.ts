/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Flags } from '@oclif/core'
import jsonColorizer from 'json-colorizer'
import { IronfishCommand } from '../../command'
import { ColorFlag, ColorFlagKey } from '../../flags'
import { RemoteFlags } from '../../flags'

export class ShowCommand extends IronfishCommand {
  static description = `Print out the entire config`

  static flags = {
    ...RemoteFlags,
    [ColorFlagKey]: ColorFlag,
    user: Flags.boolean({
      description: 'only show config from the users datadir and not overrides',
    }),
    local: Flags.boolean({
      default: false,
      description: 'dont connect to the node when displaying the config',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(ShowCommand)

    const client = await this.sdk.connectRpc(flags.local)
    const response = await client.getConfig({ user: flags.user })

    let output = JSON.stringify(response.content, undefined, '   ')
    if (flags.color) {
      output = jsonColorizer(output)
    }
    this.log(output)
  }
}
