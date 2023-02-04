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

export class Burn extends IronfishCommand {
  static description = 'Burn tokens and decrease supply for a given asset'

  static examples = [
    '$ ironfish wallet:burn --assetId 618c098d8d008c9f78f6155947014901a019d9ec17160dc0f0d1bb1c764b29b4 --amount 1000',
    '$ ironfish wallet:burn --assetId 618c098d8d008c9f78f6155947014901a019d9ec17160dc0f0d1bb1c764b29b4 --amount 1000 --account otheraccount',
    '$ ironfish wallet:burn --assetId 618c098d8d008c9f78f6155947014901a019d9ec17160dc0f0d1bb1c764b29b4 --amount 1000 --account otheraccount --fee 0.00000001',
  ]

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      char: 'f',
      description: 'The account to burn from',
    }),
    fee: IronFlag({
      char: 'o',
      description: 'The fee amount in IRON',
      largerThan: 0n,
      flagName: 'fee',
    }),
    amount: IronFlag({
      char: 'a',
      description: 'Amount of coins to burn',
      flagName: 'amount',
    }),
    assetId: Flags.string({
      char: 'i',
      description: 'Identifier for the asset',
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
        'Return raw transaction. Use it to create a transaction but not post to the network',
    }),
    expiration: Flags.integer({
      char: 'e',
      description:
        'The block sequence that the transaction can not be mined after. Set to 0 for no expiration.',
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

    const confirmations = flags.confirmations

    let assetId = flags.assetId

    if (assetId == null) {
      assetId = await selectAsset(client, account, {
        action: 'burn',
        showNativeAsset: false,
        showSingleAssetChoice: true,
        confirmations,
      })
    }

    if (assetId == null) {
      this.error(`You must have a custom asset in order to burn.`)
    }

    let amount
    if (flags.amount) {
      amount = flags.amount
    } else {
      const input = await CliUx.ux.prompt('Enter the amount to burn in the custom asset', {
        required: true,
      })

      amount = await parseIron(input, { flagName: 'amount' }).catch((error: Error) =>
        this.error(error.message),
      )
    }

    let fee
    let rawTransactionResponse: string
    if (flags.fee) {
      fee = CurrencyUtils.encode(flags.fee)
      const createResponse = await client.createTransaction({
        sender: account,
        receives: [],
        burns: [
          {
            assetId,
            value: CurrencyUtils.encode(amount),
          },
        ],
        fee: fee,
        expiration: flags.expiration,
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
        burns: [
          {
            assetId,
            value: CurrencyUtils.encode(amount),
          },
        ],
        expiration: flags.expiration,
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
      this.log(`
You are about to burn:
${CurrencyUtils.renderIron(
  amount,
  true,
  assetId,
)} plus a transaction fee of ${CurrencyUtils.renderIron(
        rawTransaction.fee,
        true,
      )} with the account ${account}
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

      this.log(`
Burned asset ${assetId} from ${account}
Value: ${CurrencyUtils.renderIron(amount)}

Transaction Hash: ${transaction.hash().toString('hex')}

Find the transaction on https://explorer.ironfish.network/transaction/${transaction
        .hash()
        .toString(
          'hex',
        )}(it can take a few minutes before the transaction appears in the Explorer)`)
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
