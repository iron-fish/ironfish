/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  displayIronAmountWithCurrency,
  displayIronToOreRate,
  displayOreAmountWithCurrency,
  ironToOre,
  isValidPublicAddress,
  oreToIron,
  RpcClient,
} from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { ProgressBar } from '../../types'

export class Pay extends IronfishCommand {
  static description = `Send coins to another account`
  static examples = [
    '$ ironfish accounts:pay -a 2 -o 1 -t 997c586852d1b12da499bcff53595ba37d04e4909dbdb1a75f3bfd90dd7212217a1c2c0da652d187fc52ed',
    '$ ironfish accounts:pay -a 2 -o 1 -t 997c586852d1b12da499bcff53595ba37d04e4909dbdb1a75f3bfd90dd7212217a1c2c0da652d187fc52ed -f otheraccount',
    '$ ironfish accounts:pay -a 2 -o 1 -t 997c586852d1b12da499bcff53595ba37d04e4909dbdb1a75f3bfd90dd7212217a1c2c0da652d187fc52ed -f otheraccount -m my_message_for_the_transaction',
  ]

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      char: 'f',
      parse: (input: string) => Promise.resolve(input.trim()),
      description: 'the account to send money from',
    }),
    amount: Flags.integer({
      char: 'a',
      parse: (input: string) => Promise.resolve(ironToOre(Number(input))),
      description: 'amount to send in IRON',
    }),
    to: Flags.string({
      char: 't',
      parse: (input: string) => Promise.resolve(input.trim()),
      description: 'the public address of the recipient',
    }),
    fee: Flags.integer({
      char: 'o',
      parse: (input: string) => Promise.resolve(Number(input)),
      description: `the fee amount in ORE ${displayIronToOreRate()}`,
    }),
    memo: Flags.string({
      char: 'm',
      parse: (input: string) => Promise.resolve(input.trim()),
      description: 'the memo of transaction',
    }),
    isConfirmed: Flags.boolean({
      default: false,
      description: 'confirm without asking',
    }),
    expirationSequence: Flags.integer({
      char: 'e',
      description:
        'The block sequence after which the transaction will be removed from the mempool. Set to 0 for no expiration.',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(Pay)
    let fromAccount = flags.account
    let toAddress = flags.to
    let amountInOre = flags.amount
    let feeInOre = flags.fee
    const expirationSequence = flags.expirationSequence
    const memo = flags.memo || ''

    const client = await this.sdk.connectRpc(false, true)

    const status = await client.status()
    if (!status.content.blockchain.synced) {
      this.log(
        `Your node must be synced with the Iron Fish network to send a transaction. Please try again later`,
      )
      this.exit(1)
    }

    if (!fromAccount) {
      fromAccount = await this.getFromAccountFromPrompt(client)
    }

    const balanceResponse = await client.getAccountBalance({ account: fromAccount })
    const balance = balanceResponse.content.confirmed
      ? Number(balanceResponse.content.confirmed)
      : 0

    if (!amountInOre) {
      const amountInIron = Number(
        await CliUx.ux.prompt(
          `Enter the amount in $IRON (balance available: ${displayIronAmountWithCurrency(
            oreToIron(balance),
            false,
          )})`,
          {
            required: true,
          },
        ),
      )
      amountInOre = ironToOre(amountInIron)
    }

    if (!feeInOre) {
      feeInOre = await this.getFeeFromPrompt(client)
    }

    if (!toAddress) {
      toAddress = (await CliUx.ux.prompt('Enter the the public address of the recipient', {
        required: true,
      })) as string
    }

    await this.validate(
      fromAccount,
      toAddress,
      amountInOre,
      feeInOre,
      expirationSequence,
      balance,
      !flags.isConfirmed,
    )
    await this.processSend(
      fromAccount,
      toAddress,
      amountInOre,
      feeInOre,
      expirationSequence,
      memo,
      client,
    )
  }

  async validate(
    fromAccount: string,
    toAddress: string,
    amountInOre: number,
    feeInOre: number,
    expirationSequence: number | undefined,
    balance: number,
    shouldConfirm: boolean,
  ): Promise<void> {
    if (shouldConfirm) {
      this.log(
        `You are about to send: ${displayIronAmountWithCurrency(
          oreToIron(amountInOre),
          true,
        )} plus a transaction fee of ${displayIronAmountWithCurrency(
          oreToIron(feeInOre),
          true,
        )} to ${toAddress} from the account ${fromAccount}`,
      )
      this.log(`* This action is NOT reversible *`)

      const confirm = await CliUx.ux.confirm('Do you confirm (Y/N)?')
      if (!confirm) {
        this.log('Transaction aborted.')
        this.exit(0)
      }
    }

    if (!isValidPublicAddress(toAddress)) {
      this.error(`A valid public address is required`)
    }

    if (
      Number.isNaN(amountInOre) ||
      Number.isNaN(feeInOre) ||
      amountInOre <= 0 ||
      feeInOre <= 0
    ) {
      this.error(`Please enter positive values for amount and fee`)
    }

    if (amountInOre + feeInOre > balance) {
      const displayAmount = displayIronAmountWithCurrency(
        oreToIron(amountInOre + feeInOre),
        false,
      )
      const displayBalance = displayIronAmountWithCurrency(oreToIron(balance), false)
      this.error(
        `Sum of amount + fee (${displayAmount}) must not be greater than total balance (${displayBalance})`,
      )
    }

    if (expirationSequence && expirationSequence < 0) {
      this.log('Expiration sequence must be non-negative')
      this.exit(1)
    }
  }

  async processSend(
    fromAccount: string,
    toAddress: string,
    amountInOre: number,
    feeInOre: number,
    expirationSequence: number | undefined,
    memo: string,
    client: RpcClient,
  ): Promise<void> {
    try {
      const result = await client.sendTransaction({
        fromAccountName: fromAccount,
        receives: [
          {
            publicAddress: toAddress,
            amount: amountInOre.toString(),
            memo: memo,
          },
        ],
        fee: feeInOre.toString(),
        expirationSequence: expirationSequence,
      })

      const transaction = result.content
      const recipients = transaction.receives.map((receive) => receive.publicAddress).join(', ')
      const amountSent = displayIronAmountWithCurrency(oreToIron(amountInOre), true)
      this.log(`Sending ${amountSent} to ${recipients} from ${transaction.fromAccountName}`)
      this.log(`Transaction Hash: ${transaction.hash}`)
      this.log(`Transaction Fee: ${displayIronAmountWithCurrency(oreToIron(feeInOre), true)}`)
      this.log(
        `Find the transaction on https://explorer.ironfish.network/transaction/${transaction.hash} (it can take a few minutes before the transaction appears in the Explorer)`,
      )
    } catch (error: unknown) {
      this.log(`An error occurred while sending the transaction.`)
      if (error instanceof Error) {
        this.error(error.message)
      }
      this.exit(2)
    }
  }

  async getFromAccountFromPrompt(client: RpcClient): Promise<string> {
    const accountResponse = await client.getDefaultAccount()

    if (!accountResponse.content.account) {
      this.error(
        `No account is currently active. Use ironfish accounts:create <name> to first create an account`,
      )
    }

    return accountResponse.content.account.name
  }

  async getFeeFromPrompt(client: RpcClient): Promise<number> {
    const defaultFeeInOre: number = await this.getDefaultFeeInOre(client)
    return Number(
      await CliUx.ux.prompt(
        `Enter the fee amount in $ORE ${displayIronToOreRate()}. Current estimated minimum is ${displayOreAmountWithCurrency(
          oreToIron(defaultFeeInOre),
        )}`,
        {
          required: true,
          default: defaultFeeInOre.toString(),
        },
      ),
    )
  }

  async getDefaultFeeInOre(client: RpcClient): Promise<number> {
    return (await client.getFees({ numOfBlocks: 100 })).content.p25
  }
}
