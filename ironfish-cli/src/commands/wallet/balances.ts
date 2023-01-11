/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BufferUtils, CurrencyUtils, GetBalancesResponse } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

// TODO(rohanjadvani): Remove this after assets are added to the wallet
type Balance = GetBalancesResponse['balances'][number] & {
  name: string
}

export class BalancesCommand extends IronfishCommand {
  static description = `Display the account's balances for all assets`

  static flags = {
    ...RemoteFlags,
    all: Flags.boolean({
      default: false,
      description: `Also show unconfirmed balance, head hash, and head sequence`,
    }),
    confirmations: Flags.integer({
      required: false,
      description: 'Minimum number of blocks confirmations for a note',
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
    const response = await client.getAccountBalances({
      account,
      confirmations: flags.confirmations,
    })
    this.log(`Account: ${response.content.account}`)

    let columns: CliUx.Table.table.Columns<Balance> = {
      name: {
        header: 'Asset Name',
      },
      assetId: {
        header: 'Asset Id',
      },
      confirmed: {
        header: 'Confirmed Balance',
        get: (row) => CurrencyUtils.renderIron(row.confirmed),
      },
    }

    if (flags.all) {
      columns = {
        ...columns,
        unconfirmed: {
          header: 'Unconfirmed Balance',
          get: (row) => CurrencyUtils.renderIron(row.unconfirmed),
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

    const balancesWithNames = []
    // TODO(rohanjadvani) We currently fetch the asset from the blockchain to
    // populate the name when rendering balance. This can be refactored once
    // the wallet persists assets.
    for (const balance of response.content.balances) {
      const assetResponse = await client.getAsset({ id: balance.assetId })
      const name = BufferUtils.toHuman(Buffer.from(assetResponse.content.name, 'hex'))
      balancesWithNames.push({ ...balance, name })
    }

    CliUx.ux.table(balancesWithNames, columns)
  }
}
