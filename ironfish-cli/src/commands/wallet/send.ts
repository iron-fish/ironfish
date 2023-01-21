/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import {
  CreateTransactionRequest,
  CurrencyUtils,
  isValidPublicAddress,
  RawTransactionSerde,
  Transaction,
} from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import inquirer from 'inquirer'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { ProgressBar } from '../../types'
import { selectAsset } from '../../utils/asset'

export class Send extends IronfishCommand {
  static description = `Send coins to another account`

  static examples = [
    '$ ironfish wallet:send --amount 2 --fee 0.00000001 --to 997c586852d1b12da499bcff53595ba37d04e4909dbdb1a75f3bfd90dd7212217a1c2c0da652d187fc52ed',
    '$ ironfish wallet:send --amount 2 --fee 0.00000001 --to 997c586852d1b12da499bcff53595ba37d04e4909dbdb1a75f3bfd90dd7212217a1c2c0da652d187fc52ed --account otheraccount',
    '$ ironfish wallet:send --amount 2 --fee 0.00000001 --to 997c586852d1b12da499bcff53595ba37d04e4909dbdb1a75f3bfd90dd7212217a1c2c0da652d187fc52ed --account otheraccount --memo "enjoy!"',
  ]

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      char: 'f',
      description: 'The account to send money from',
    }),
    amount: Flags.string({
      char: 'a',
      description: 'Amount of coins to send in IRON',
    }),
    to: Flags.string({
      char: 't',
      description: 'The public address of the recipient',
    }),
    fee: Flags.string({
      char: 'o',
      description: 'The fee amount in IRON',
    }),
    feeRate: Flags.string({
      char: 'r',
      description: 'The fee rate amount in IRON/Kilobyte',
    }),
    memo: Flags.string({
      char: 'm',
      description: 'The memo of transaction',
    }),
    confirm: Flags.boolean({
      default: false,
      description: 'Confirm without asking',
    }),
    expiration: Flags.integer({
      char: 'e',
      description:
        'The block sequence after which the transaction will be removed from the mempool. Set to 0 for no expiration.',
    }),
    assetId: Flags.string({
      char: 'i',
      description: 'The identifier for the asset to use when sending',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(Send)
    let amount = null
    let fee = null
    let feeRate = null
    let assetId = flags.assetId
    let to = flags.to?.trim()
    let from = flags.account?.trim()
    const expiration = flags.expiration
    const memo = flags.memo || ''

    const client = await this.sdk.connectRpc(false, true)

    const status = await client.getNodeStatus()
    if (!status.content.blockchain.synced) {
      this.log(
        `Your node must be synced with the Iron Fish network to send a transaction. Please try again later`,
      )
      this.exit(1)
    }

    if (assetId == null) {
      assetId = await selectAsset(client, from, {
        action: 'send',
        showNativeAsset: true,
        showSingleAssetChoice: false,
      })
    }

    if (!assetId) {
      assetId = Asset.nativeId().toString('hex')
    }

    if (flags.amount) {
      amount = CurrencyUtils.decodeIron(flags.amount)
    }

    if (amount === null) {
      const response = await client.getAccountBalance({ account: from, assetId })

      const input = await CliUx.ux.prompt(
        `Enter the amount (balance: ${CurrencyUtils.renderIron(response.content.confirmed)})`,
        {
          required: true,
        },
      )

      amount = CurrencyUtils.decodeIron(input)
    }

    if (flags.fee) {
      if (CurrencyUtils.decodeIron(flags.fee) < 1n) {
        this.error(`The minimum fee is ${CurrencyUtils.renderOre(1n, true)}`)
      }

      fee = CurrencyUtils.encode(CurrencyUtils.decodeIron(flags.fee))
    }

    if (flags.feeRate) {
      feeRate = CurrencyUtils.encode(CurrencyUtils.decodeIron(flags.feeRate))
    }

    if (!from) {
      const response = await client.getDefaultAccount()
      const defaultAccount = response.content.account

      if (!defaultAccount) {
        this.error(
          `No account is currently active.
           Use ironfish wallet:create <name> to first create an account`,
        )
      }

      from = defaultAccount.name
    }

    if (!to) {
      to = await CliUx.ux.prompt('Enter the public address of the recipient', {
        required: true,
      })

      if (!isValidPublicAddress(to)) {
        this.error(`A valid public address is required`)
      }
    }

    if (!isValidPublicAddress(to)) {
      this.log(`A valid public address is required`)
      this.exit(1)
    }

    if (expiration !== undefined && expiration < 0) {
      this.log('Expiration sequence must be non-negative')
      this.exit(1)
    }

    let rawTransactionResponse: string
    if (fee == null && feeRate == null) {
      const feeRates = await client.estimateFeeRates()
      const feeRateOptions: { value: number; name: string }[] = []

      const createTransactionRequest: CreateTransactionRequest = {
        sender: from,
        receives: [
          {
            publicAddress: to,
            amount: CurrencyUtils.encode(amount),
            memo,
            assetId,
          },
        ],
        expiration: expiration,
      }

      const allPromises = []
      if (feeRates.content.low) {
        allPromises.push(
          client.createTransaction({
            ...createTransactionRequest,
            feeRate: feeRates.content.low,
          }),
        )
      }

      if (feeRates.content.medium !== feeRates.content.low) {
        allPromises.push(
          client.createTransaction({
            ...createTransactionRequest,
            feeRate: feeRates.content.medium,
          }),
        )
      }

      if (
        feeRates.content.high !== feeRates.content.low &&
        feeRates.content.high !== feeRates.content.medium
      ) {
        allPromises.push(
          client.createTransaction({
            ...createTransactionRequest,
            feeRate: feeRates.content.high,
          }),
        )
      }

      const createResponses = await Promise.all(allPromises)
      createResponses.forEach((createResponse, index) => {
        const rawTransactionBytes = Buffer.from(createResponse.content.transaction, 'hex')
        const rawTransaction = RawTransactionSerde.deserialize(rawTransactionBytes)

        let name
        switch (index) {
          case 0: {
            name = 'Low'
            break
          }
          case 1: {
            name = 'Medium'
            break
          }
          default: {
            name = 'High'
            break
          }
        }
        feeRateOptions.push({
          value: index,
          name: `${name}: ${CurrencyUtils.renderIron(rawTransaction.fee)} IRON`,
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
    } else {
      const createResponse = await client.createTransaction({
        sender: from,
        receives: [
          {
            publicAddress: to,
            amount: CurrencyUtils.encode(amount),
            memo,
            assetId,
          },
        ],
        fee: fee,
        feeRate: feeRate,
        expiration: expiration,
      })
      rawTransactionResponse = createResponse.content.transaction
    }

    const rawTransactionBytes = Buffer.from(rawTransactionResponse, 'hex')
    const rawTransaction = RawTransactionSerde.deserialize(rawTransactionBytes)

    if (!flags.confirm) {
      this.log(`
You are about to send:
${CurrencyUtils.renderIron(
  amount,
  true,
  assetId,
)} plus a transaction fee of ${CurrencyUtils.renderIron(
        rawTransaction.fee,
        true,
      )} to ${to} from the account ${from}

* This action is NOT reversible *
`)

      const confirm = await CliUx.ux.confirm('Do you confirm (Y/N)?')
      if (!confirm) {
        this.log('Transaction aborted.')
        this.exit(0)
      }
    }

    // Run the progress bar for about 2 minutes
    // Chances are that the transaction will finish faster (error or faster computer)
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
      const result = await client.postTransaction({
        transaction: rawTransactionResponse,
      })

      stopProgressBar()

      const transactionBytes = Buffer.from(result.content.transaction, 'hex')
      const transaction = new Transaction(transactionBytes)

      this.log(`
Sending ${CurrencyUtils.renderIron(amount, true, assetId)} to ${to} from ${from}
Transaction Hash: ${transaction.hash().toString('hex')}
Transaction fee: ${CurrencyUtils.renderIron(transaction.fee(), true)}

Find the transaction on https://explorer.ironfish.network/transaction/${transaction
        .hash()
        .toString(
          'hex',
        )} (it can take a few minutes before the transaction appears in the Explorer)`)
    } catch (error: unknown) {
      stopProgressBar()
      this.log(`An error occurred while sending the transaction.`)
      if (error instanceof Error) {
        this.error(error.message)
      }
      this.exit(2)
    }
  }
}
