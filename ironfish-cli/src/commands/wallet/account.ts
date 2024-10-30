/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { RpcRequestError } from '@ironfish/sdk'
import { Args } from '@oclif/core'
import chalk from 'chalk'
import { IronfishCommand } from '../../command'
import { JsonFlags, RemoteFlags } from '../../flags'
import * as ui from '../../ui'

export class AccountsCommand extends IronfishCommand {
  static description = `display status for a wallet account`
  static enableJsonFlag = true

  static flags = {
    ...RemoteFlags,
    ...JsonFlags,
  }

  static args = {
    account: Args.string({
      description: 'name of the account to display status for',
    }),
  }

  async start(): Promise<unknown> {
    const { args } = await this.parse(AccountsCommand)

    const client = await this.connectRpc()
    await ui.checkWalletUnlocked(client)

    const account =
      args.account ?? (await client.wallet.getDefaultAccount()).content.account?.name

    if (!account) {
      this.log(
        'There is currently no account being used.\n' +
          ' * Create an account: "ironfish wallet:create"\n' +
          ' * List all accounts: "ironfish wallet:accounts"\n' +
          ' * Use an existing account: "ironfish wallet:use <name>"',
      )
      return {}
    }

    try {
      const response = await client.wallet.getAccountStatus({ account })

      const status: Record<string, unknown> = {
        Account: response.content.account.name,
        Default: response.content.account.default ? chalk.green('✓') : '',
        'View Only': response.content.account.viewOnly ? chalk.green('✓') : '',
        'In Chain': response.content.account.head?.inChain ? chalk.green('✓') : '',
        Scanning: response.content.account.scanningEnabled ? chalk.green('✓') : '',
        Sequence: response.content.account.head?.sequence,
        Head: response.content.account.head?.hash,
      }

      this.log(ui.card(status))

      return status
    } catch (e) {
      if (e instanceof RpcRequestError && e.codeMessage.includes('No account with name')) {
        this.log(e.codeMessage)
        return {}
      } else {
        throw e
      }
    }
  }
}
