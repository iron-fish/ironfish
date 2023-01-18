/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CurrencyUtils } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { ProgressBar } from '../../types'
import { selectAsset } from '../../utils/asset'

export class Burn extends IronfishCommand {
  static description = 'Burn tokens and decrease supply for a given asset'

  static examples = [
    '$ ironfish wallet:burn --assetId=618c098d8d008c9f78f6155947014901a019d9ec17160dc0f0d1bb1c764b29b4 --amount=1000',
    '$ ironfish wallet:burn --assetId=618c098d8d008c9f78f6155947014901a019d9ec17160dc0f0d1bb1c764b29b4 --amount=1000 --account=otheraccount',
    '$ ironfish wallet:burn --assetId=618c098d8d008c9f78f6155947014901a019d9ec17160dc0f0d1bb1c764b29b4 --amount=1000 --account=otheraccount --fee=0.00000001',
  ]

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      char: 'f',
      description: 'The account to burn from',
    }),
    fee: Flags.string({
      char: 'o',
      description: 'The fee amount in IRON',
    }),
    amount: Flags.string({
      char: 'a',
      description: 'Amount of coins to burn in IRON',
    }),
    assetId: Flags.string({
      char: 'i',
      description: 'Identifier for the asset',
    }),
    confirm: Flags.boolean({
      default: false,
      description: 'Confirm without asking',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(Burn)
    const client = await this.sdk.connectRpc(false, true)

    const status = await client.getNodeStatus()
    if (!status.content.blockchain.synced) {
      this.log(
        `Your node must be synced with the Iron Fish network to send a transaction. Please try again later`,
      )
      this.exit(1)
    }

    let account = flags.account?.trim()
    if (!account) {
      const response = await client.getDefaultAccount()
      const defaultAccount = response.content.account

      if (!defaultAccount) {
        this.error(
          `No account is currently active.
           Use ironfish wallet:create <name> to first create an account`,
        )
      }

      account = defaultAccount.name
    }

    let assetId = flags.assetId

    if (assetId == null) {
      assetId = await selectAsset(client, account, {
        action: 'burn',
        showNativeAsset: false,
        showSingleAssetChoice: true,
      })
    }

    if (assetId == null) {
      this.error(`You must have a custom asset in order to burn.`)
    }

    let amount
    if (flags.amount) {
      amount = CurrencyUtils.decodeIron(flags.amount)
    } else {
      const input = await CliUx.ux.prompt('Enter the amount to burn in the custom asset', {
        required: true,
      })

      amount = CurrencyUtils.decodeIron(input)
    }

    let fee
    if (flags.fee) {
      fee = CurrencyUtils.decodeIron(flags.fee)
    } else {
      const input = await CliUx.ux.prompt(
        `Enter the fee amount in $IRON (min: ${CurrencyUtils.renderIron(1n)})`,
        {
          default: CurrencyUtils.renderIron(1n),
          required: true,
        },
      )

      fee = CurrencyUtils.decodeIron(input)
    }

    if (!flags.confirm) {
      this.log(`
You are about to burn:
${CurrencyUtils.renderIron(
  amount,
  true,
  assetId,
)} plus a transaction fee of ${CurrencyUtils.renderIron(fee, true)} with the account ${account}

* This action is NOT reversible *
`)

      const confirm = await CliUx.ux.confirm('Do you confirm (Y/N)?')
      if (!confirm) {
        this.log('Transaction aborted.')
        this.exit(0)
      }
    }

    const bar = CliUx.ux.progress({
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      format: 'Creating the transaction: [{bar}] {percentage}% | ETA: {eta}s',
    }) as ProgressBar

    bar.start()

    let value = 0
    const timer = setInterval(() => {
      value++
      bar.update(value)
      if (value >= bar.getTotal()) {
        bar.stop()
      }
    }, 1000)

    const stopProgressBar = () => {
      clearInterval(timer)
      bar.update(100)
      bar.stop()
    }

    try {
      const result = await client.burnAsset({
        account,
        assetId,
        fee: CurrencyUtils.encode(fee),
        value: CurrencyUtils.encode(amount),
      })

      stopProgressBar()

      const response = result.content
      this.log(`
Burned asset ${response.assetId} from ${account}
Value: ${CurrencyUtils.renderIron(response.value)}

Transaction Hash: ${response.hash}

Find the transaction on https://explorer.ironfish.network/transaction/${
        response.hash
      } (it can take a few minutes before the transaction appears in the Explorer)`)
    } catch (error: unknown) {
      stopProgressBar()
      this.log(`An error occurred while burning the asset.`)
      if (error instanceof Error) {
        this.error(error.message)
      }
      this.exit(2)
    }
  }
}
