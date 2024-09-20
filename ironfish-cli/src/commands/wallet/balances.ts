/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BufferUtils, CurrencyUtils, GetBalancesResponse, RpcAsset } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { checkWalletUnlocked, table, TableColumns, TableFlags } from '../../ui'
import { compareAssets, renderAssetWithVerificationStatus, useAccount } from '../../utils'

type AssetBalancePairs = { asset: RpcAsset; balance: GetBalancesResponse['balances'][number] }

export class BalancesCommand extends IronfishCommand {
  static description = `show the account's balance for all assets`

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
      description: 'Minimum number of blocks confirmations for a transaction',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(BalancesCommand)
    const client = await this.connectRpc()
    await checkWalletUnlocked(client)

    const account = await useAccount(client, flags.account)

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

    let columns: TableColumns<AssetBalancePairs> = {
      assetName: {
        header: 'Asset',
        get: ({ asset }) =>
          renderAssetWithVerificationStatus(
            BufferUtils.toHuman(Buffer.from(asset.name, 'hex')),
            {
              verification: asset.verification,
              outputType: flags.output,
            },
          ),
      },
      available: {
        header: 'Balance',
        get: ({ asset, balance }) =>
          CurrencyUtils.render(balance.available, false, asset.id, asset.verification),
      },
    }

    if (flags.all) {
      columns = {
        ...columns,
        confirmed: {
          header: 'Confirmed',
          get: ({ asset, balance }) =>
            CurrencyUtils.render(balance.confirmed, false, asset.id, asset.verification),
        },
        unconfirmed: {
          header: 'Unconfirmed',
          get: ({ asset, balance }) =>
            CurrencyUtils.render(balance.unconfirmed, false, asset.id, asset.verification),
        },
        pending: {
          header: 'Pending',
          get: ({ asset, balance }) =>
            CurrencyUtils.render(balance.pending, false, asset.id, asset.verification),
        },
        availableNotes: {
          header: 'Notes',
          get: ({ balance }) => balance.availableNoteCount,
        },
        'asset.id': {
          header: 'Asset Id',
          get: ({ asset }) => asset.id,
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

    table(assetBalancePairs, columns, { ...flags })
  }
}
