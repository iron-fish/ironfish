/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CliUx } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class StatusCommand extends IronfishCommand {
  static description = `Get status of all accounts`

  static flags = {
    ...RemoteFlags,
    ...CliUx.ux.table.flags(),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(StatusCommand)

    const client = await this.sdk.connectRpc()

    const response = await client.wallet.getAccountsStatus()

    CliUx.ux.table(
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
      },
      {
        printLine: this.log.bind(this),
        ...flags,
      },
    )
  }
}
