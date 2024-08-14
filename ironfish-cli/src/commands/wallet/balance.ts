/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CurrencyUtils, GetBalanceResponse, isNativeIdentifier, RpcAsset } from '@ironfish/sdk'
import { Args, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import * as ui from '../../ui'
import { renderAssetWithVerificationStatus } from '../../utils'

export class BalanceCommand extends IronfishCommand {
  static description =
    'Display the account balance\n\
  What is the difference between available to spend balance, and balance?\n\
  Available to spend balance is your coins from transactions that have been mined on blocks on your main chain.\n\
  Balance is your coins from all of your transactions, even if they are on forks or not yet included as part of a mined block.'

  static args = {
    account: Args.string({
      required: false,
      description: 'Name of the account to get balance for. DEPRECATED: use --account flag',
    }),
  }

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      char: 'a',
      description: 'Name of the account to get balance for',
    }),
    explain: Flags.boolean({
      default: false,
      description: 'Explain your balance',
    }),
    all: Flags.boolean({
      default: false,
      description: 'Also show unconfirmed balance',
    }),
    confirmations: Flags.integer({
      required: false,
      description: 'Minimum number of blocks confirmations for a transaction',
    }),
    assetId: Flags.string({
      required: false,
      description: 'Asset identifier to check the balance for',
    }),
  }

  async start(): Promise<void> {
    const { flags, args } = await this.parse(BalanceCommand)
    // TODO: remove account arg
    const account = flags.account ? flags.account : args.account

    const client = await this.connectRpc()

    const response = await client.wallet.getAccountBalance({
      account,
      assetId: flags.assetId,
      confirmations: flags.confirmations,
    })

    const assetId = response.content.assetId

    const asset = (
      await client.wallet.getAsset({
        account,
        id: assetId,
        confirmations: flags.confirmations,
      })
    ).content

    let nameToRender
    if (isNativeIdentifier(assetId)) {
      nameToRender = '$IRON'
    } else {
      nameToRender = asset.verification.symbol || assetId
    }
    const assetName = renderAssetWithVerificationStatus(nameToRender, asset)

    if (flags.explain) {
      this.explainBalance(response.content, asset, assetName)
      return
    }

    const renderedAvailable = renderValue(response.content.available, asset, assetName)
    const renderedConfirmed = renderValue(response.content.confirmed, asset, assetName)
    const renderedUnconfirmed = renderValue(response.content.unconfirmed, asset, assetName)
    const renderedPending = renderValue(response.content.pending, asset, assetName)
    if (flags.all) {
      this.log(
        ui.card({
          Account: response.content.account,
          'Head Hash': response.content.blockHash || 'NULL',
          'Head Sequence': response.content.sequence || 'NULL',
          Available: renderedAvailable,
          Confirmed: renderedConfirmed,
          Unconfirmed: renderedUnconfirmed,
          Pending: renderedPending,
        }),
      )
      return
    }

    this.log(
      ui.card({
        Account: response.content.account,
        'Available Balance': renderedAvailable,
      }),
    )
  }

  explainBalance(response: GetBalanceResponse, asset: RpcAsset, assetName: string): void {
    const unconfirmed = CurrencyUtils.decode(response.unconfirmed)
    const confirmed = CurrencyUtils.decode(response.confirmed)
    const pending = CurrencyUtils.decode(response.pending)
    const available = CurrencyUtils.decode(response.available)

    const unconfirmedDelta = unconfirmed - confirmed
    const pendingDelta = pending - unconfirmed

    const renderedUnconfirmed = renderValue(unconfirmed, asset, assetName)
    const renderedUnconfirmedDelta = renderValue(unconfirmedDelta, asset, assetName)
    const renderedConfirmed = renderValue(confirmed, asset, assetName)
    const renderedPending = renderValue(pending, asset, assetName)
    const renderedPendingDelta = renderValue(pendingDelta, asset, assetName)
    const renderedAvailable = renderValue(available, asset, assetName)

    this.log(`Account: ${response.account}`)

    this.log(
      `Your balance is calculated from transactions on the chain through block ${
        response.blockHash ?? 'NULL'
      } at sequence ${response.sequence ?? 'NULL'}`,
    )
    this.log('')

    this.log(
      `Your available balance is made of ${response.availableNoteCount} notes on the chain that are safe to spend`,
    )
    this.log(`Available: ${renderedAvailable}`)
    this.log('')

    this.log('Your confirmed balance includes all notes from transactions on the chain')
    this.log(`Confirmed: ${renderedConfirmed}`)
    this.log('')

    this.log(
      `${response.unconfirmedCount} transactions worth ${renderedUnconfirmedDelta} are on the chain within ${response.confirmations} blocks of the head`,
    )
    this.log(`Unconfirmed: ${renderedUnconfirmed}`)
    this.log('')

    this.log(
      `${response.pendingCount} transactions worth ${renderedPendingDelta} are pending and have not been added to the chain`,
    )
    this.log(`Pending: ${renderedPending}`)
  }
}

// TODO(mat): Eventually this logic should probably be rolled into
// CurrencyUtils.render() via additional options
function renderValue(amount: string | bigint, asset: RpcAsset, assetName: string): string {
  const renderNameManually = asset.verification.status === 'verified'

  if (renderNameManually) {
    return `${assetName} ${CurrencyUtils.render(amount, false, asset.id, asset.verification)}`
  } else {
    return CurrencyUtils.render(amount, true, asset.id, asset.verification)
  }
}
