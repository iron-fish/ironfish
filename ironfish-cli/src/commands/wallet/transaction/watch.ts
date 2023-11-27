/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'
import { watchTransaction } from '../../../utils/transaction'

export class WatchTxCommand extends IronfishCommand {
  static description = `Display an account transaction`

  static flags = {
    ...RemoteFlags,
    confirmations: Flags.integer({
      required: false,
      description: 'Minimum number of blocks confirmations for a transaction',
    }),
  }

  static args = [
    {
      name: 'hash',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: true,
      description: 'Hash of the transaction',
    },
    {
      name: 'account',
      required: false,
      description: 'Name of the account',
    },
  ]

  async start(): Promise<void> {
    const { flags, args } = await this.parse(WatchTxCommand)
    const hash = args.hash as string
    const account = args.account as string | undefined

    const client = await this.sdk.connectRpc()

    await watchTransaction({
      client,
      logger: this.logger,
      account,
      hash,
      confirmations: flags.confirmations,
    })
  }
}
