/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BufferUtils, CurrencyUtils, GetBalancesResponse, RpcAsset } from '@ironfish/sdk'
import { Flags, ux } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { compareAssets, renderAssetWithVerificationStatus } from '../../utils'
import { TableFlags } from '../../utils/table'

type AssetBalancePairs = { asset: RpcAsset; balance: GetBalancesResponse['balances'][number] }

export class BalancesCommand extends IronfishCommand {
  static description = `Display the account's balances for all assets`

  static flags = {
    ...RemoteFlags,
    ...TableFlags,
    account: Flags.string({
      char: 'a',
      description: 'Name of the account to get balances for',
    }),
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
      required: false,
      description: 'Name of the account to get balances for. DEPRECATED: use --account flag',
    },
  ]

  async start(): Promise<void> {
    const { flags, args } = await this.parse(BalancesCommand)
    const client = await this.sdk.connectRpc()

    // TODO: remove account arg
    const account = flags.account ? flags.account : (args.account as string | undefined)
    const response = await client.wallet.getAccountBalances({
      account,
      confirmations: flags.confirmations,
    })
    this.log(`Account: ${response.content.account}`)

    const assetBalancePairs: AssetBalancePairs[] = []

    for (const balance of response.content.balances) {
      const asset = await client.wallet.getAsset({
        account,
        id: balance.assetId,
        confirmations: flags.confirmations,
      })

      assetBalancePairs.push({
        balance,
        asset: asset.content,
      })
    }

    let columns: ux.Table.table.Columns<AssetBalancePairs> = {
      assetName: {
        header: 'Asset Name',
        get: ({ asset }) =>
          renderAssetWithVerificationStatus(
            BufferUtils.toHuman(Buffer.from(asset.name, 'hex')),
            {
              verification: asset.verification,
              outputType: flags.output,
            },
          ),
      },
      'asset.id': {
        header: 'Asset Id',
        get: ({ asset }) => asset.id,
      },
      available: {
        header: 'Available Balance',
        get: ({ asset, balance }) =>
          CurrencyUtils.render(balance.available, false, asset.id, asset.verification),
      },
    }

    if (flags.all) {
      columns = {
        ...columns,
        availableNotes: {
          header: 'Available Notes',
          get: ({ balance }) => balance.availableNoteCount,
        },
        confirmed: {
          header: 'Confirmed Balance',
          get: ({ asset, balance }) =>
            CurrencyUtils.render(balance.confirmed, false, asset.id, asset.verification),
        },
        unconfirmed: {
          header: 'Unconfirmed Balance',
          get: ({ asset, balance }) =>
            CurrencyUtils.render(balance.unconfirmed, false, asset.id, asset.verification),
        },
        pending: {
          header: 'Pending Balance',
          get: ({ asset, balance }) =>
            CurrencyUtils.render(balance.pending, false, asset.id, asset.verification),
        },
        blockHash: {
          header: 'Head Hash',
          get: ({ balance }) => balance.blockHash || 'NULL',
        },
        sequence: {
          header: 'Head Sequence',
          get: ({ balance }) => balance.sequence || 'NULL',
        },
      }
    }

    assetBalancePairs.sort((left, right) =>
      compareAssets(
        left.asset.name,
        left.asset.verification,
        right.asset.name,
        right.asset.verification,
      ),
    )

    ux.table(assetBalancePairs, columns, { ...flags })
  }
}
