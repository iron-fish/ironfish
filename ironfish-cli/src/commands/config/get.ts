/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ConfigOptions } from '@ironfish/sdk'
import { Args, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { JsonFlags, RemoteFlags } from '../../flags'
import * as ui from '../../ui'

export class GetCommand extends IronfishCommand {
  static description = `show a single config value`
  static enableJsonFlag = true

  static args = {
    name: Args.string({
      required: true,
      description: 'Name of the config item',
    }),
  }

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
    const { args, flags } = await this.parse(GetCommand)
    const { name } = args

    const client = await this.connectRpc(flags.local)

    const response = await client.config.getConfig({
      user: flags.user,
      name: name,
    })

    const key = name as keyof Partial<ConfigOptions>
    if (response.content[key] === undefined) {
      this.exit(0)
    }

    const config = { [key]: response.content[key] }

    this.log(ui.card(config))

    return config
  }
}
