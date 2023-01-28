/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CliUx } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class AddTxCommand extends IronfishCommand {
  static description = `Add a transaction to your wallet`

  static flags = {
    ...RemoteFlags,
  }

  static args = [
    {
      name: 'transaction',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      description: 'The transaction in hex encoding',
    },
  ]

  async start(): Promise<void> {
    const { args } = await this.parse(AddTxCommand)
    const transaction = args.transaction as string

    CliUx.ux.action.start(`Adding transaction`)
    const client = await this.sdk.connectRpc()
    const response = await client.addTransaction({ transaction })
    CliUx.ux.action.stop()

    this.log(`Transaction added for account ${response.content.account}`)
  }
}
