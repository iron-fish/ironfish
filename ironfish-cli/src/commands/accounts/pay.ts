/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { flags } from '@oclif/command'
import cli from 'cli-ux'
import {
  displayIronAmountWithCurrency,
  ironToOre,
  isValidAmount,
  isValidPublicAddress,
  MINIMUM_IRON_AMOUNT,
  oreToIron,
} from 'ironfish'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { ProgressBar } from '../../types'

export class Pay extends IronfishCommand {
  static description = `Send coins to another account`

  static examples = [
    '$ ironfish accounts:pay -a 2 -o 0.00000001 -t 997c586852d1b12da499bcff53595ba37d04e4909dbdb1a75f3bfd90dd7212217a1c2c0da652d187fc52ed',
    '$ ironfish accounts:pay -a 2 -o 0.00000001 -t 997c586852d1b12da499bcff53595ba37d04e4909dbdb1a75f3bfd90dd7212217a1c2c0da652d187fc52ed -f otheraccount',
    '$ ironfish accounts:pay -a 2 -o 0.00000001 -t 997c586852d1b12da499bcff53595ba37d04e4909dbdb1a75f3bfd90dd7212217a1c2c0da652d187fc52ed -f otheraccount -m my_message_for_the_transaction',
  ]

  static flags = {
    ...RemoteFlags,
    account: flags.string({
      char: 'f',
      description: 'the account to send money from',
    }),
    amount: flags.string({
      char: 'a',
      description: 'amount of coins to send',
    }),
    to: flags.string({
      char: 't',
      description: 'the public address of the recipient',
    }),
    fee: flags.string({
      char: 'o',
      description: 'the fee amount in IRON',
    }),
    memo: flags.string({
      char: 'm',
      description: 'the memo of transaction',
    }),
    confirm: flags.boolean({
      default: false,
      description: 'confirm without asking',
    }),
    expirationSequence: flags.integer({
      char: 'e',
      description:
        'The block sequence after which the transaction will be removed from the mempool. Set to 0 for no expiration.',
    }),
  }

  async start(): Promise<void> {
    const { flags } = this.parse(Pay)
    let amount = flags.amount as unknown as number
    let fee = flags.fee as unknown as number
    let to = flags.to
    let from = flags.account
    const expirationSequence = flags.expirationSequence
    const memo = flags.memo || ''

    const client = await this.sdk.connectRpc()

    const status = await client.status()

    if (!status.content.blockchain.synced) {
      this.log(
        `Your node must be synced with the Iron Fish network to send a transaction. Please try again later`,
      )
      this.exit(1)
    }

    if (!amount || Number.isNaN(amount)) {
      const response = await client.getAccountBalance({ account: from })

      amount = (await cli.prompt(
        `Enter the amount in $IRON (balance available: ${displayIronAmountWithCurrency(
          oreToIron(Number(response.content.confirmed)),
          false,
        )})`,
        {
          required: true,
        },
      )) as number

      if (Number.isNaN(amount)) {
        this.error(`A valid amount is required`)
      }
    }

    if (!fee || Number.isNaN(Number(fee))) {
      fee = (await cli.prompt('Enter the fee amount in $IRON', {
        required: true,
        default: '0.00000001',
      })) as number

      if (Number.isNaN(fee)) {
        this.error(`A valid fee amount is required`)
      }
    }

    if (!to) {
      to = (await cli.prompt('Enter the the public address of the recipient', {
        required: true,
      })) as string

      if (!isValidPublicAddress(to)) {
        this.error(`A valid public address is required`)
      }
    }

    if (!from) {
      const response = await client.getDefaultAccount()
      const defaultAccount = response.content.account

      if (!defaultAccount) {
        this.error(
          `No account is currently active.
           Use ironfish accounts:create <name> to first create an account`,
        )
      }

      from = defaultAccount.name
    }

    if (!isValidAmount(amount)) {
      this.log(
        `The minimum transaction amount is ${displayIronAmountWithCurrency(
          MINIMUM_IRON_AMOUNT,
          false,
        )}.`,
      )
      this.exit(0)
    }

    if (!isValidAmount(fee)) {
      this.log(
        `The minimum fee amount is ${displayIronAmountWithCurrency(
          MINIMUM_IRON_AMOUNT,
          false,
        )}.`,
      )
      this.exit(0)
    }

    if (expirationSequence !== undefined && expirationSequence < 0) {
      this.log('Expiration sequence must be non-negative')
      this.exit(1)
    }

    if (!flags.confirm) {
      this.log(`
You are about to send:
${displayIronAmountWithCurrency(
  amount,
  true,
)} plus a transaction fee of ${displayIronAmountWithCurrency(
        fee,
        true,
      )} to ${to} from the account ${from}

* This action is NOT reversible *
`)

      const confirm = await cli.confirm('Do you confirm (Y/N)?')
      if (!confirm) {
        this.log('Transaction aborted.')
        this.exit(0)
      }
    }

    // Run the progress bar for about 2 minutes
    // Chances are that the transaction will finish faster (error or faster computer)
    const bar = cli.progress({
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
      const result = await client.sendTransaction({
        fromAccountName: from,
        receives: [
          {
            publicAddress: to,
            amount: ironToOre(amount).toString(),
            memo: memo,
          },
        ],
        fee: ironToOre(fee).toString(),
        expirationSequence,
      })

      stopProgressBar()

      const transaction = result.content
      const recipients = transaction.receives.map((receive) => receive.publicAddress).join(', ')
      this.log(`
Sending ${displayIronAmountWithCurrency(amount, true)} to ${recipients} from ${
        transaction.fromAccountName
      }
Transaction Hash: ${transaction.hash}
Transaction fee: ${displayIronAmountWithCurrency(fee, true)}

Find the transaction on https://explorer.ironfish.network/transaction/${
        transaction.hash
      } (it can take a few minutes before the transaction appears in the Explorer)`)
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
