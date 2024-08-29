/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Args, Flags } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'
import * as ui from '../../../ui'
import { watchTransaction } from '../../../utils/transaction'

export class TransactionsWatchCommand extends IronfishCommand {
  static description = `wait for an account transaction to confirm`
  static hiddenAliases = ['wallet:transaction:watch']

  static args = {
    transaction: Args.string({
      required: true,
      description: 'Hash of the transaction',
    }),
    account: Args.string({
      required: false,
      description: 'Name of the account. DEPRECATED: use --account flag',
    }),
  }

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      char: 'a',
      description: 'Name of the account to get transaction details for',
    }),
    confirmations: Flags.integer({
      description: 'Minimum number of blocks confirmations for a transaction',
    }),
  }

  async start(): Promise<void> {
    const { flags, args } = await this.parse(TransactionsWatchCommand)
    const { transaction: hash } = args
    // TODO: remove account arg
    const account = flags.account ? flags.account : args.account

    const client = await this.connectRpc()
    await ui.checkWalletUnlocked(client)

    await watchTransaction({
      client,
      logger: this.logger,
      account,
      hash,
      confirmations: flags.confirmations,
    })
  }
}
