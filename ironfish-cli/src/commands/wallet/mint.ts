/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CurrencyUtils } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { ProgressBar } from '../../types'
import { selectAsset } from '../../utils/asset'

export class Mint extends IronfishCommand {
  static description = 'Mint tokens and increase supply for a given asset'

  static examples = [
    '$ ironfish wallet:mint --metadata="see more here" --name=mycoin --amount=1000',
    '$ ironfish wallet:mint --assetId=618c098d8d008c9f78f6155947014901a019d9ec17160dc0f0d1bb1c764b29b4 --amount=1000',
    '$ ironfish wallet:mint --assetId=618c098d8d008c9f78f6155947014901a019d9ec17160dc0f0d1bb1c764b29b4 --amount=1000 --account=otheraccount',
    '$ ironfish wallet:mint --assetId=618c098d8d008c9f78f6155947014901a019d9ec17160dc0f0d1bb1c764b29b4 --amount=1000 --account=otheraccount --fee=0.00000001',
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
    confirm: Flags.boolean({
      default: false,
      description: 'Confirm without asking',
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

    let assetId = flags.assetId
    let metadata = flags.metadata
    let name = flags.name

    // We can assume the prompt can be skipped if at least one of metadata or
    // name is provided
    let isMintingNewAsset = Boolean(metadata || name)
    if (!assetId && !metadata && !name) {
      isMintingNewAsset = await CliUx.ux.confirm('Do you want to create a new asset (Y/N)?')
    }

    if (isMintingNewAsset) {
      if (!name) {
        name = await CliUx.ux.prompt('Enter the name for the new asset', {
          required: true,
        })
      }

      if (!metadata) {
        metadata = await CliUx.ux.prompt('Enter metadata for the new asset', {
          default: '',
          required: false,
        })
      }
    } else if (!assetId) {
      assetId = await selectAsset(client, account, {
        action: 'mint',
        showNativeAsset: false,
        showSingleAssetChoice: true,
      })

      if (!assetId) {
        this.error(`You must have an existing asset. Try creating a new one.`)
      }
    }

    let amount
    if (flags.amount) {
      amount = CurrencyUtils.decodeIron(flags.amount)
    } else {
      const input = await CliUx.ux.prompt('Enter the amount to mint in the custom asset', {
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
      const nameString = name ? `Name: ${name}` : ''
      const metadataString = metadata ? `Metadata: ${metadata}` : ''
      const includeTicker = !!assetId
      const amountString = CurrencyUtils.renderIron(amount, includeTicker, assetId)
      const feeString = CurrencyUtils.renderIron(fee, true)
      this.log(`
You are about to mint ${nameString} ${metadataString}
${amountString} plus a transaction fee of ${feeString} with the account ${account}

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
      const result = await client.mintAsset({
        account,
        assetId,
        fee: CurrencyUtils.encode(fee),
        metadata,
        name,
        value: CurrencyUtils.encode(amount),
      })

      stopProgressBar()

      const response = result.content
      this.log(`
Minted asset ${response.name} from ${account}
Asset Identifier: ${response.assetId}
Value: ${CurrencyUtils.renderIron(response.value)}

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
