/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { JsonFlags } from '../../flags'
import { RemoteFlags } from '../../flags'
import * as ui from '../../ui'

export class ShowCommand extends IronfishCommand {
  static description = "show the node's config"
  static enableJsonFlag = true

  static flags = {
    ...RemoteFlags,
    ...JsonFlags,
    user: Flags.boolean({
      description: 'Only show config from the users datadir and not overrides',
    }),
    local: Flags.boolean({
      default: false,
      description: 'Dont connect to the node when displaying the config',
    }),
  }

  async start(): Promise<unknown> {
    const { flags } = await this.parse(ShowCommand)

    const client = await this.connectRpc(flags.local)
    const response = await client.config.getConfig({ user: flags.user })
    const config = response.content

    this.log(ui.card(config))

    return config
  }
}
