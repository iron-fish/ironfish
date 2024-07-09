/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '@ironfish/sdk'
import { Flags, ux } from '@oclif/core'
import chalk from 'chalk'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { TableFlags } from '../../utils/table'

export class StatusCommand extends IronfishCommand {
  static description = `Get status of all accounts`

  static flags = {
    ...RemoteFlags,
    ...TableFlags,
    passphrase: Flags.string({
      required: false,
      description: 'Passphrase for wallet',
    }),
    timeout: Flags.integer({
      required: false,
      description: 'Timeout to unlock for wallet',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(StatusCommand)

    const client = await this.sdk.connectRpc()

    let passphrase = flags.passphrase
    const status = await client.wallet.getNodeStatus()
    if (status.content.accounts.locked && !passphrase) {
      passphrase = await ux.prompt('Enter your passphrase to unlock the wallet', {
        required: true,
      })
    }

    if (status.content.accounts.locked) {
      Assert.isNotUndefined(passphrase)
      await client.wallet.unlock({
        passphrase,
        timeout: flags.timeout,
      })
    }

    const response = await client.wallet.getAccountsStatus()

    ux.table(
      response.content.accounts,
      {
        name: {
          header: 'Account Name',
          minWidth: 11,
        },
        id: {
          header: 'Account ID',
        },
        viewOnly: {
          header: 'View Only',
        },
        headHash: {
          get: (row) => row.head?.hash ?? 'NULL',
          header: 'Head Hash',
        },
        headInChain: {
          get: (row) => row.head?.inChain ?? 'NULL',
          header: 'Head In Chain',
        },
        sequence: {
          get: (row) => row.head?.sequence ?? 'NULL',
          header: 'Head Sequence',
        },
        scanningEnabled: {
          get: (row) => (row.scanningEnabled ? chalk.green('✓') : ''),
          header: 'Scanning Enabled',
        },
      },
      {
        printLine: this.log.bind(this),
        ...flags,
      },
    )
  }
}
