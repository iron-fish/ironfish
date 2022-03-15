/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ConfigOptions } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import jsonColorizer from 'json-colorizer'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class GetCommand extends IronfishCommand {
  static description = `Print out one config value`

  static args = [
    {
      name: 'name',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: true,
      description: 'name of the config item',
    },
  ]

  static flags = {
    ...RemoteFlags,
    user: Flags.boolean({
      description: 'only show config from the users datadir and not overrides',
    }),
    local: Flags.boolean({
      default: false,
      description: 'dont connect to the node when displaying the config',
    }),
    color: Flags.boolean({
      default: true,
      allowNo: true,
      description: 'should colorize the output',
    }),
  }

  async start(): Promise<void> {
    const { args, flags } = await this.parse(GetCommand)
    const name = (args.name as string).trim()

    const client = await this.sdk.connectRpc(flags.local)

    const response = await client.getConfig({
      user: flags.user,
      name: name,
    })

    const key = name as keyof Partial<ConfigOptions>
    if (response.content[key] === undefined) {
      this.exit(0)
    }

    let output = JSON.stringify(response.content[key], undefined, '   ')
    if (flags.color) {
      output = jsonColorizer(output)
    }

    this.log(output)
    this.exit(0)
  }
}
