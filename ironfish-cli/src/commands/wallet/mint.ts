/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CurrencyUtils } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { ProgressBar } from '../../types'

export class Mint extends IronfishCommand {
  static description = 'Mint tokens and increase supply for a given asset'

  static examples = [
    '$ ironfish wallet:mint -m "see more here" -n mycoin -a 1000 -f myaccount -o 0.00000001',
  ]

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      char: 'f',
      description: 'The account to mint from',
    }),
    fee: Flags.string({
      char: 'o',
      description: 'The fee amount in IRON',
    }),
    amount: Flags.string({
      char: 'a',
      description: 'Amount of coins to mint in IRON',
      required: true,
    }),
    assetId: Flags.string({
      char: 'i',
      description: 'Identifier for the asset',
      required: false,
    }),
    metadata: Flags.string({
      char: 'm',
      description: 'Metadata for the asset',
      required: false,
    }),
    name: Flags.string({
      char: 'n',
      description: 'Name for the asset',
      required: false,
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(Mint)
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

    let fee
    if (flags.fee) {
      fee = CurrencyUtils.decodeIron(flags.fee)
    } else {
      const input = await CliUx.ux.prompt(
        `Enter the fee amount in $IRON (min: ${CurrencyUtils.renderIron(1n)})`,
        {
          required: true,
        },
      )

      fee = CurrencyUtils.decodeIron(input)
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
      const amount = CurrencyUtils.decodeIron(flags.amount)
      const result = await client.mintAsset({
        account,
        assetId: flags.assetId,
        fee: CurrencyUtils.encode(fee),
        metadata: flags.metadata,
        name: flags.name,
        value: CurrencyUtils.encode(amount),
      })

      stopProgressBar()

      const response = result.content
      this.log(`
Minted asset ${response.name} from ${account}
Asset Identifier: ${response.assetId}
Value: ${CurrencyUtils.encode(amount)}

Transaction Hash: ${response.hash}

Find the transaction on https://explorer.ironfish.network/transaction/${
        response.hash
      } (it can take a few minutes before the transaction appears in the Explorer)`)
    } catch (error: unknown) {
      stopProgressBar()
      this.log(`An error occurred while minting the asset.`)
      if (error instanceof Error) {
        this.error(error.message)
      }
      this.exit(2)
    }
  }
}
