/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import chalk from 'chalk'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { table, TableFlags } from '../../ui'

export class StatusCommand extends IronfishCommand {
  static description = `Get status of all accounts`

  static flags = {
    ...RemoteFlags,
    ...TableFlags,
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(StatusCommand)

    const client = await this.connectRpc()

    const response = await client.wallet.getAccountsStatus()

    table(
      response.content.accounts,
      {
        name: {
          get: (row) => row.name,
          header: 'Account Name',
          minWidth: 11,
        },
        id: {
          get: (row) => row.id,
          header: 'Account ID',
        },
        viewOnly: {
          get: (row) => row.viewOnly,
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
