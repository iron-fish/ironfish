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
  client: RpcClient | undefined
  fromAccount: string | undefined
  toAddress: string | undefined
  amountInOre: number | undefined
  feeInOre: number | undefined
  memo: string | undefined
  expirationSequence: number | undefined

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
    this.fromAccount = flags.account
    this.toAddress = flags.to
    this.amountInOre = flags.amount
    this.feeInOre = flags.fee
    this.expirationSequence = flags.expirationSequence
    this.memo = flags.memo || ''

    this.client = await this.sdk.connectRpc(false, true)

    const status = await this.client.status()
    if (!status.content.blockchain.synced) {
      this.log(
        `Your node must be synced with the Iron Fish network to send a transaction. Please try again later`,
      )
      this.exit(1)
    }

    if (!this.fromAccount) {
      this.fromAccount = await this.getFromAccountFromPrompt()
    }

    const balanceResponse = await this.client.getAccountBalance({ account: this.fromAccount })
    const balance = balanceResponse.content.confirmed
      ? Number(balanceResponse.content.confirmed)
      : 0

    if (!this.amountInOre) {
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
      this.amountInOre = ironToOre(amountInIron)
    }

    if (!this.feeInOre) {
      this.feeInOre = await this.getFeeFromPrompt()
    }

    if (!this.toAddress) {
      this.toAddress = (await CliUx.ux.prompt('Enter the the public address of the recipient', {
        required: true,
      })) as string
    }

    await this.validate(balance, !flags.isConfirmed)
    await this.processSend()
  }

  async processSend(): Promise<void> {
    const result = await this.client!.sendTransaction({
      fromAccountName: this.fromAccount!,
      receives: [
        {
          publicAddress: this.toAddress!,
          amount: this.amountInOre!.toString(),
          memo: this.memo!,
        },
      ],
      fee: this.feeInOre!.toString(),
      expirationSequence: this.expirationSequence!,
    })

    const transaction = result.content
    const recipients = transaction.receives.map((receive) => receive.publicAddress).join(', ')
    const amountSent = displayIronAmountWithCurrency(oreToIron(this.amountInOre!), true)
    this.log(`Sending ${amountSent} to ${recipients} from ${transaction.fromAccountName}`)
    this.log(`Transaction Hash: ${transaction.hash}`)
    this.log(
      `Transaction Fee: ${displayIronAmountWithCurrency(oreToIron(this.feeInOre!), true)}`,
    )
    this.log(
      `Find the transaction on https://explorer.ironfish.network/transaction/${transaction.hash} (it can take a few minutes before the transaction appears in the Explorer)`,
    )
  }

  async validate(balance: number, shouldConfirm: boolean): Promise<void> {
    if (shouldConfirm) {
      this.log(
        `You are about to send: ${displayIronAmountWithCurrency(
          oreToIron(this.amountInOre!),
          true,
        )} plus a transaction fee of ${displayIronAmountWithCurrency(
          oreToIron(this.feeInOre!),
          true,
        )} to ${this.toAddress!} from the account ${this.fromAccount!}`,
      )
      this.log(`* This action is NOT reversible *`)

      const confirm = await CliUx.ux.confirm('Do you confirm (Y/N)?')
      if (!confirm) {
        this.log('Transaction aborted.')
        this.exit(0)
      }
    }

    // TODO: need to mock this out in tests. How?
    // if (!isValidPublicAddress(this.toAddress!)) {
    //   this.error(`A valid public address is required`)
    // }

    if (
      Number.isNaN(this.amountInOre) ||
      Number.isNaN(this.feeInOre) ||
      this.amountInOre! <= 0 ||
      this.feeInOre! <= 0
    ) {
      this.error(`Please enter positive values for amount and fee`)
    }

    if (this.amountInOre! + this.feeInOre! > balance) {
      const displayAmount = displayIronAmountWithCurrency(
        oreToIron(this.amountInOre! + this.feeInOre!),
        false,
      )
      const displayBalance = displayIronAmountWithCurrency(oreToIron(balance), false)
      this.error(
        `Sum of amount + fee (${displayAmount}) must not be greater than total balance (${displayBalance})`,
      )
    }

    if (this.expirationSequence && this.expirationSequence < 0) {
      this.log('Expiration sequence must be non-negative')
      this.exit(1)
    }
  }

  async getFromAccountFromPrompt(): Promise<string> {
    const accountResponse = await this.client!.getDefaultAccount()

    if (!accountResponse.content.account) {
      this.error(
        `No account is currently active. Use ironfish accounts:create <name> to first create an account`,
      )
    }

    return accountResponse.content.account.name
  }

  async getFeeFromPrompt(): Promise<number> {
    const defaultFeeInOre: number = await this.getDefaultFeeInOre()
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

  async getDefaultFeeInOre(): Promise<number> {
    return (await this.client!.getFees({ numOfBlocks: 100 })).content.p25
  }
}
