/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { connectRpcConfig } from '../../utils/clients'

export class UnsetCommand extends IronfishCommand {
  static description = `Unset a value in the config and fall back to default`

  static args = [
    {
      name: 'name',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: true,
      description: 'Name of the config item',
    },
  ]

  static flags = {
    ...RemoteFlags,
    local: Flags.boolean({
      default: false,
      description: 'Dont connect to the node when updating the config',
    }),
  }

  static examples = ['$ ironfish config:unset blockGraffiti']

  async start(): Promise<void> {
    const { args, flags } = await this.parse(UnsetCommand)
    const name = args.name as string

    const client = await connectRpcConfig(this.sdk, flags.local)
    await client.config.unsetConfig({ name })

    this.exit(0)
  }
}
