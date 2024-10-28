/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import chalk from 'chalk'
import { IronfishCommand } from '../../command'
import { JsonFlags, RemoteFlags } from '../../flags'
import * as ui from '../../ui'

export class AccountsCommand extends IronfishCommand {
  static description = `list accounts in the wallet`
  static enableJsonFlag = true

  static hiddenAliases = ['wallet:accounts']

  static flags = {
    ...RemoteFlags,
    ...JsonFlags,
    ...ui.TableFlags,
  }

  async start(): Promise<unknown> {
    const { flags } = await this.parse(AccountsCommand)

    const client = await this.connectRpc()
    await ui.checkWalletUnlocked(client)

    const response = await client.wallet.getAccountsStatus()

    if (response.content.locked) {
      this.log('Your wallet is locked. Unlock the wallet to access your accounts')
      this.exit(0)
    }

    if (response.content.accounts.length === 0) {
      this.log('you have no accounts')
      return []
    }

    ui.table(
      response.content.accounts,
      {
        name: {
          get: (row) => row.name,
          header: 'Account',
          minWidth: 11,
        },
        default: {
          get: (row) => (row.default ? chalk.green('✓') : ''),
          header: 'Default',
        },
        viewOnly: {
          get: (row) => (row.viewOnly ? chalk.green('✓') : ''),
          header: 'View Only',
          extended: true,
        },
        headInChain: {
          get: (row) => (row.head?.inChain ? chalk.green('✓') : ''),
          header: 'In Chain',
          extended: true,
        },
        scanningEnabled: {
          get: (row) => (row.scanningEnabled ? chalk.green('✓') : ''),
          header: 'Scanning',
          extended: true,
        },
        sequence: {
          get: (row) => row.head?.sequence ?? '',
          header: 'Sequence',
          extended: true,
        },
        headHash: {
          get: (row) => row.head?.hash ?? '',
          header: 'Head',
          extended: true,
        },
      },
      {
        ...flags,
        printLine: this.log.bind(this),
      },
    )

    return response.content.accounts
  }
}
