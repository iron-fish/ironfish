/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IronfishRpcClient, IronfishSdk } from 'ironfish'
import {
  ColorFlag,
  ColorFlagKey,
  ConfigFlag,
  ConfigFlagKey,
  DataDirFlag,
  DataDirFlagKey,
} from '../../flags'
import { IronfishCommand } from '../../command'
import jsonColorizer from 'json-colorizer'
import { flags } from '@oclif/command'

export class ShowCommand extends IronfishCommand {
  static description = `Print out the entire config`

  static flags = {
    [ConfigFlagKey]: ConfigFlag,
    [DataDirFlagKey]: DataDirFlag,
    [ColorFlagKey]: ColorFlag,
    user: flags.boolean({
      description: 'only show config from the users datadir and not overrides',
    }),
    local: flags.boolean({
      default: false,
      description: 'dont connect to the node when displaying the config',
    }),
  }

  async start(): Promise<void> {
    const { flags } = this.parse(ShowCommand)

    const client = await getConnectedClient(this.sdk, flags.local)
    const response = await client.getConfig({ user: flags.user })

    let output = JSON.stringify(response.content, undefined, '   ')
    if (flags.color) output = jsonColorizer(output)
    this.log(output)
  }
}

export async function getConnectedClient(
  sdk: IronfishSdk,
  local: boolean,
): Promise<IronfishRpcClient> {
  if (local) {
    const node = await sdk.node()
    await sdk.clientMemory.connect(node)
    return sdk.clientMemory
  }

  await sdk.client.connect()
  return sdk.client
}
