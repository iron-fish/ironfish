/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  CreateTransactionRequest,
  CreateTransactionResponse,
  CurrencyUtils,
  RawTransactionSerde,
  RpcResponseEnded,
  Transaction,
} from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import inquirer from 'inquirer'
import { IronfishCommand } from '../../command'
import { IronFlag, parseIron, RemoteFlags } from '../../flags'
import { ProgressBar } from '../../types'
import { selectAsset } from '../../utils/asset'

export class Mint extends IronfishCommand {
  static description = 'Mint tokens and increase supply for a given asset'

  static examples = [
    '$ ironfish wallet:mint --metadata "see more here" --name mycoin --amount 1000',
    '$ ironfish wallet:mint --assetId 618c098d8d008c9f78f6155947014901a019d9ec17160dc0f0d1bb1c764b29b4 --amount 1000',
    '$ ironfish wallet:mint --assetId 618c098d8d008c9f78f6155947014901a019d9ec17160dc0f0d1bb1c764b29b4 --amount 1000 --account otheraccount',
    '$ ironfish wallet:mint --assetId 618c098d8d008c9f78f6155947014901a019d9ec17160dc0f0d1bb1c764b29b4 --amount 1000 --account otheraccount --fee 0.00000001',
  ]

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      char: 'f',
      description: 'The account to mint from',
    }),
    fee: IronFlag({
      char: 'o',
      description: 'The fee amount in IRON',
      largerThan: 0n,
      flagName: 'fee',
    }),
    amount: IronFlag({
      char: 'a',
      description: 'Amount of coins to send',
      flagName: 'amount',
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
    confirmations: Flags.integer({
      char: 'c',
      description:
        'Minimum number of block confirmations needed to include a note. Set to 0 to include all blocks.',
      required: false,
    }),
    rawTransaction: Flags.boolean({
      default: false,
      description:
        'Return the raw transaction. Used to create a transaction but not post to the network',
    }),
    expiration: Flags.integer({
      char: 'e',
      description:
        'The block sequence that the transaction can not be mined after. Set to 0 for no expiration.',
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

    const confirmations = flags.confirmations

    const expiration = flags.expiration

    if (expiration !== undefined && expiration < 0) {
      this.log('Expiration sequence must be non-negative')
      this.exit(1)
    }

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
        confirmations: confirmations,
      })

      if (!assetId) {
        this.error(`You must have an existing asset. Try creating a new one.`)
      }
    }

    let amount
    if (flags.amount) {
      amount = flags.amount
    } else {
      const input = await CliUx.ux.prompt('Enter the amount to mint in the custom asset', {
        required: true,
      })

      amount = await parseIron(input, { flagName: 'amount' }).catch((error: Error) =>
        this.error(error.message),
      )
    }

    let fee
    let rawTransactionResponse: string

    if (flags.fee) {
      fee = flags.fee

      const createResponse = await client.createTransaction({
        sender: account,
        receives: [],
        mints: [
          {
            assetId,
            name,
            metadata,
            value: CurrencyUtils.encode(amount),
          },
        ],
        fee: CurrencyUtils.encode(fee),
        expiration: expiration,
        confirmations: confirmations,
      })
      rawTransactionResponse = createResponse.content.transaction
    } else {
      const feeRatesResponse = await client.estimateFeeRates()
      const feeRates = new Set([
        feeRatesResponse.content.low ?? '1',
        feeRatesResponse.content.medium ?? '1',
        feeRatesResponse.content.high ?? '1',
      ])

      const feeRateNames = Object.getOwnPropertyNames(feeRatesResponse.content)

      const feeRateOptions: { value: number; name: string }[] = []

      const createTransactionRequest: CreateTransactionRequest = {
        sender: account,
        receives: [],
        mints: [
          {
            assetId,
            name,
            metadata,
            value: CurrencyUtils.encode(amount),
          },
        ],
        expiration: expiration,
        confirmations: confirmations,
      }

      const allPromises: Promise<RpcResponseEnded<CreateTransactionResponse>>[] = []
      feeRates.forEach((feeRate) => {
        allPromises.push(
          client.createTransaction({
            ...createTransactionRequest,
            feeRate: feeRate,
          }),
        )
      })

      const createResponses = await Promise.all(allPromises)
      createResponses.forEach((createResponse, index) => {
        const rawTransactionBytes = Buffer.from(createResponse.content.transaction, 'hex')
        const rawTransaction = RawTransactionSerde.deserialize(rawTransactionBytes)

        feeRateOptions.push({
          value: index,
          name: `${feeRateNames[index]}: ${CurrencyUtils.renderIron(rawTransaction.fee)} IRON`,
        })
      })

      const input: { selection: number } = await inquirer.prompt<{ selection: number }>([
        {
          name: 'selection',
          message: `Select the fee you wish to use for this transaction`,
          type: 'list',
          choices: feeRateOptions,
        },
      ])

      rawTransactionResponse = createResponses[input.selection].content.transaction
    }

    const rawTransactionBytes = Buffer.from(rawTransactionResponse, 'hex')
    const rawTransaction = RawTransactionSerde.deserialize(rawTransactionBytes)

    if (!flags.confirm) {
      const nameString = name ? `Name: ${name}` : ''
      const metadataString = metadata ? `Metadata: ${metadata}` : ''
      const includeTicker = !!assetId
      const amountString = CurrencyUtils.renderIron(amount, includeTicker, assetId)
      const feeString = CurrencyUtils.renderIron(rawTransaction.fee, true)
      this.log(`
You are about to mint ${nameString} ${metadataString}
${amountString} plus a transaction fee of ${feeString} with the account ${account}
`)

      if (!flags.rawTransaction) {
        this.log(`* This action is NOT reversible *\n`)
      }

      const confirm = await CliUx.ux.confirm('Do you confirm (Y/N)?')
      if (!confirm) {
        this.log('Transaction aborted.')
        this.exit(0)
      }
    }

    if (flags.rawTransaction) {
      this.log(`Raw transaction: ${rawTransactionResponse}`)
      this.log(`\nRun "ironfish wallet:post" to post the raw transaction. `)
      this.exit(0)
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

    let transaction
    try {
      const result = await client.postTransaction({
        transaction: rawTransactionResponse,
        sender: account,
      })

      stopProgressBar()

      const transactionBytes = Buffer.from(result.content.transaction, 'hex')
      transaction = new Transaction(transactionBytes)

      const minted = transaction.mints[0]

      this.log(`
Minted asset ${minted.asset.name().toString('hex')} from ${account}
Asset Identifier: ${minted.asset.id().toString('hex')}
Value: ${CurrencyUtils.renderIron(minted.value, true, minted.asset.id().toString('hex'))}

Transaction Hash: ${transaction.hash().toString('hex')}

Find the transaction on https://explorer.ironfish.network/transaction/${transaction
        .hash()
        .toString(
          'hex',
        )} (it can take a few minutes before the transaction appears in the Explorer)`)
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
