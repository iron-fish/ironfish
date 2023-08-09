/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'

export class TransactionAddCommand extends IronfishCommand {
  static description = `Add a transaction to your wallet`

  static flags = {
    ...RemoteFlags,
    broadcast: Flags.boolean({
      default: true,
      allowNo: true,
      description: 'Broadcast the transaction to the network after adding',
    }),
  }

  static args = [
    {
      name: 'transaction',
      required: true,
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      description: 'The transaction in hex encoding',
    },
  ]

  async start(): Promise<void> {
    const { flags, args } = await this.parse(TransactionAddCommand)
    const transaction = args.transaction as string

    CliUx.ux.action.start(`Adding transaction`)
    const client = await this.sdk.connectWalletRpc({ connectNodeClient: flags.broadcast })
    const response = await client.wallet.addTransaction({
      transaction,
      broadcast: flags.broadcast,
    })
    CliUx.ux.action.stop()

    this.log(`Transaction added for accounts: ${response.content.accounts.join(', ')}`)
  }
}
