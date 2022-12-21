/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'

export default class Asset extends IronfishCommand {
  static description = 'Get the asset info'

  static args = [
    {
      name: 'identifier',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: true,
      description: 'The identifier of the asset',
    },
  ]

  static flags = {
    ...LocalFlags,
  }

  async start(): Promise<void> {
    const { args } = await this.parse(Asset)
    const assetIdentifier = args.identifier as string

    this.log(`Getting the asset info...`)

    const client = await this.sdk.connectRpc()
    const data = await client.getAssetInfo({ assetIdentifier })

    this.log(JSON.stringify(data.content, undefined, '  '))
  }
}
