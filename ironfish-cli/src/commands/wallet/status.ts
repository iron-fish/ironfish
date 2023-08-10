/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CliUx } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class StatusCommand extends IronfishCommand {
  static description = `Get status of an account`

  static flags = {
    ...RemoteFlags,
    ...CliUx.ux.table.flags(),
  }

  async start(): Promise<void> {
    const { args, flags } = await this.parse(StatusCommand)
    const account = args.account as string | undefined

    const client = await this.sdk.connectWalletRpc({ connectNodeClient: true })

    const response = await client.wallet.getAccountsStatus({
      account: account,
    })

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
        headHash: {
          header: 'Head Hash',
        },
        headInChain: {
          header: 'Head In Chain',
        },
        sequence: {
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
