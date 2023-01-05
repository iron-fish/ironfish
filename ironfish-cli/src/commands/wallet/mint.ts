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
    '$ ironfish wallet:mint -m "see more here" -n mycoin -a 1000 -f myaccount -o 1',
  ]

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      char: 'f',
      description: 'The account to mint from',
      required: true,
    }),
    fee: Flags.string({
      char: 'o',
      description: 'The fee amount in IRON',
      required: true,
    }),
    amount: Flags.string({
      char: 'a',
      description: 'Amount of coins to mint',
      required: true,
    }),
    metadata: Flags.string({
      char: 'm',
      description: 'Metadata for the asset',
      required: true,
    }),
    name: Flags.string({
      char: 'n',
      description: 'Name for the asset',
      required: true,
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(Mint)
    // TODO(mgeist,rohanjadvani):
    // These fields will be required for now. They will be made optional when
    // this CLI command is refactored to also accept an asset identifier
    const account = flags.account
    const fee = flags.fee
    const metadata = flags.metadata
    const name = flags.name
    const amount = flags.amount
    const client = await this.sdk.connectRpc(false, true)

    const status = await client.getNodeStatus()
    if (!status.content.blockchain.synced) {
      this.log(
        `Your node must be synced with the Iron Fish network to send a transaction. Please try again later`,
      )
      this.exit(1)
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
      const result = await client.mintAsset({
        account,
        fee,
        metadata,
        name,
        value: amount,
      })

      stopProgressBar()

      const response = result.content
      this.log(`
 Minted asset ${name} from ${account}
 Asset Identifier: ${response.assetId}
 Value: ${amount}
 
 Transaction Hash: ${response.hash}
 Transaction fee: ${CurrencyUtils.renderIron(fee, true)}
 
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
