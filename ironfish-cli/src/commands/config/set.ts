/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { flags } from '@oclif/command'
import { ConfigFlag, ConfigFlagKey, DataDirFlag, DataDirFlagKey } from '../../flags'
import { IronfishCommand } from '../../command'
import { getConnectedClient } from './show'

export class SetCommand extends IronfishCommand {
  static description = `Set a value in the config`

  static args = [
    {
      name: 'name',
      parse: (input: string): string => input.trim(),
      required: true,
      description: 'name of the config item',
    },
    {
      name: 'value',
      parse: (input: string): string => input.trim(),
      required: true,
      description: 'value of the config item',
    },
  ]

  static flags = {
    [ConfigFlagKey]: ConfigFlag,
    [DataDirFlagKey]: DataDirFlag,
    local: flags.boolean({
      default: false,
      description: 'dont connect to the node when updating the config',
    }),
  }

  static examples = [
    '$ ironfish config:set bootstrapNodes "test.bn1.ironfish.network,example.com"',
  ]

  async start(): Promise<void> {
    const { args, flags } = this.parse(SetCommand)
    const name = args.name as string
    const value = args.value as string

    const client = await getConnectedClient(this.sdk, flags.local)
    await client.setConfig({ name, value })

    this.exit(0)
  }
}
