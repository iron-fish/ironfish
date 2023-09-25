/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CurrencyUtils, GetBalancesResponse, RpcAsset } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { compareAssets, renderAssetNameFromHex } from '../../utils'

type AssetBalancePairs = { asset: RpcAsset; balance: GetBalancesResponse['balances'][number] }

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

    const balancesWithAssets: AssetBalancePairs[] = []

    await Promise.all(
      response.content.balances.map(async (element) => {
        const asset = await client.wallet.getAsset({
          account,
          id: element.assetId,
          confirmations: flags.confirmations,
        })

        balancesWithAssets.push({
          balance: element,
          asset: asset.content,
        })

        const name = renderAssetNameFromHex(asset.content.name)

        this.log(`Asset: ${name}`)
      }),
    )

    let columns: CliUx.Table.table.Columns<AssetBalancePairs> = {
      assetName: {
        header: 'Asset Name',
        get: ({ asset }) =>
          renderAssetNameFromHex(asset.name, {
            verification: asset.verification,
            outputType: flags.output,
            verbose: !!flags.verbose,
            logWarn: this.warn.bind(this),
          }),
      },
      'asset.id': {
        header: 'Asset Id',
        get: ({ asset }) => asset.id,
      },
      available: {
        header: 'Available Balance',
        get: ({ balance }) => CurrencyUtils.renderIron(balance.available),
      },
    }

    if (flags.all) {
      columns = {
        ...columns,
        confirmed: {
          header: 'Confirmed Balance',
          get: ({ balance }) => CurrencyUtils.renderIron(balance.confirmed),
        },
        unconfirmed: {
          header: 'Unconfirmed Balance',
          get: ({ balance }) => CurrencyUtils.renderIron(balance.unconfirmed),
        },
        pending: {
          header: 'Pending Balance',
          get: ({ balance }) => CurrencyUtils.renderIron(balance.pending),
        },
        blockHash: {
          header: 'Head Hash',
          get: ({ balance }) => balance.blockHash || 'NULL',
        },
        sequence: {
          header: 'Head Sequence',
          get: ({ balance }) => balance.blockHash || 'NULL',
        },
      }
    }

    balancesWithAssets.sort((left, right) =>
      compareAssets(
        left.asset.name,
        left.asset.verification,
        right.asset.name,
        right.asset.verification,
      ),
    )

    CliUx.ux.table(balancesWithAssets, columns, flags)
  }
}
