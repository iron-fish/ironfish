/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { flags } from '@oclif/command'
import { ConfigOptions } from 'ironfish'
import jsonColorizer from 'json-colorizer'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { getConnectedClient } from './show'

export class GetCommand extends IronfishCommand {
  static description = `Print out one config value`

  static args = [
    {
      name: 'name',
      parse: (input: string): string => input.trim(),
      required: true,
      description: 'name of the config item',
    },
  ]

  static flags = {
    ...RemoteFlags,
    user: flags.boolean({
      description: 'only show config from the users datadir and not overrides',
    }),
    local: flags.boolean({
      default: false,
      description: 'dont connect to the node when displaying the config',
    }),
    color: flags.boolean({
      default: true,
      allowNo: true,
      description: 'should colorize the output',
    }),
  }

  async start(): Promise<void> {
    const { args, flags } = this.parse(GetCommand)
    const name = (args.name as string).trim()

    const client = await getConnectedClient(this.sdk, flags.local)

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
