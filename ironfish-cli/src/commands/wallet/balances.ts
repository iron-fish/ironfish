/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CurrencyUtils, GetBalancesResponse } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { compareAssets, renderAssetNameFromHex } from '../../utils'

export class BalancesCommand extends IronfishCommand {
  static description = `Display the account's balances for all assets`

  static flags = {
    ...RemoteFlags,
    ...CliUx.ux.table.flags(),
    all: Flags.boolean({
      default: false,
      description: `Also show unconfirmed balance, head hash, and head sequence`,
    }),
    confirmations: Flags.integer({
      required: false,
      description: 'Minimum number of blocks confirmations for a transaction',
    }),
  }

  static args = [
    {
      name: 'account',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'Name of the account to get balances for',
    },
  ]

  async start(): Promise<void> {
    const { flags, args } = await this.parse(BalancesCommand)
    const client = await this.sdk.connectRpc()

    const account = args.account as string | undefined
    const response = await client.wallet.getAccountBalances({
      account,
      confirmations: flags.confirmations,
    })
    this.log(`Account: ${response.content.account}`)

    let columns: CliUx.Table.table.Columns<GetBalancesResponse['balances'][number]> = {
      assetName: {
        header: 'Asset Name',
        get: (row) =>
          renderAssetNameFromHex(row.assetName, {
            verification: row.assetVerification,
            outputType: flags.output,
            verbose: !!flags.verbose,
            logWarn: this.warn.bind(this),
          }),
      },
      assetId: {
        header: 'Asset Id',
      },
      available: {
        header: 'Available Balance',
        get: (row) => CurrencyUtils.renderIron(row.available),
      },
    }

    if (flags.all) {
      columns = {
        ...columns,
        confirmed: {
          header: 'Confirmed Balance',
          get: (row) => CurrencyUtils.renderIron(row.confirmed),
        },
        unconfirmed: {
          header: 'Unconfirmed Balance',
          get: (row) => CurrencyUtils.renderIron(row.unconfirmed),
        },
        pending: {
          header: 'Pending Balance',
          get: (row) => CurrencyUtils.renderIron(row.pending),
        },
        blockHash: {
          header: 'Head Hash',
          get: (row) => row.blockHash || 'NULL',
        },
        sequence: {
          header: 'Head Sequence',
          get: (row) => row.sequence || 'NULL',
        },
      }
    }

    response.content.balances.sort((left, right) =>
      compareAssets(
        left.assetName,
        left.assetVerification,
        right.assetName,
        right.assetVerification,
      ),
    )

    CliUx.ux.table(response.content.balances, columns, flags)
  }
}
