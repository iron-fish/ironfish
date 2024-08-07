/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Args, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class SetCommand extends IronfishCommand {
  static description = `set a single value in the config`

  static args = {
    name: Args.string({
      required: true,
      description: 'Name of the config item',
    }),
    value: Args.string({
      required: true,
      description: 'Value of the config item',
    }),
  }

  static flags = {
    ...RemoteFlags,
    local: Flags.boolean({
      default: false,
      description: 'Dont connect to the node when updating the config',
    }),
  }

  static examples = [
    '$ ironfish config:set bootstrapNodes "test.bn1.ironfish.network,example.com"',
  ]

  async start(): Promise<void> {
    const { args, flags } = await this.parse(SetCommand)
    const { name, value } = args

    const client = await this.connectRpc(flags.local)
    await client.config.setConfig({ name, value })

    this.exit(0)
  }
}
