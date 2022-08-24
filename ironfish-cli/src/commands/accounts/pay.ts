/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  displayIronAmountWithCurrency,
  displayIronToOreRate,
  ironToOre,
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
    confirm: Flags.boolean({
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

    const balanceResponse = await client.getAccountBalance({ account: fromAccount })
    const balance = balanceResponse.content.confirmed
      ? Number(balanceResponse.content.confirmed)
      : 0

    const status = await client.status()
    if (!status.content.blockchain.synced) {
      this.log(
        `Your node must be synced with the Iron Fish network to send a transaction. Please try again later`,
      )
      this.exit(1)
    }

    if (!fromAccount) {
      const accountResponse = await client.getDefaultAccount()

      if (!accountResponse.content.account) {
        this.error(
          `No account is currently active. Use ironfish accounts:create <name> to first create an account`,
        )
      }

      fromAccount = accountResponse.content.account.name
    }

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
      feeInOre = Number(
        await CliUx.ux.prompt(`Enter the fee amount in $ORE ${displayIronToOreRate()}`, {
          required: true,
        }),
      )
    }

    if (!toAddress) {
      toAddress = (await CliUx.ux.prompt('Enter the the public address of the recipient', {
        required: true,
      })) as string
    }

    if (!flags.confirm) {
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

    this.simpleValidate(toAddress, amountInOre, feeInOre, expirationSequence, balance)

    await this.processSend(
      client,
      fromAccount,
      toAddress,
      amountInOre,
      feeInOre,
      memo,
      expirationSequence,
    )
  }

  async processSend(
    client: RpcClient,
    fromAccount: string,
    toAddress: string,
    amountInOre: number,
    feeInOre: number,
    memo: string,
    expirationSequence: number | null | undefined,
  ): Promise<void> {
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
      expirationSequence,
    })

    const transaction = result.content
    const recipients = transaction.receives.map((receive) => receive.publicAddress).join(', ')
    const amountSent = displayIronAmountWithCurrency(oreToIron(amountInOre), true)
    this.log(`Sending ${amountSent} to ${recipients} from ${transaction.fromAccountName}`)
    this.log(`Transaction Hash: ${transaction.hash}`)
    this.log(`Transaction Fee: ${displayIronAmountWithCurrency(feeInOre, true)}`)
    this.log(
      `Find the transaction on https://explorer.ironfish.network/transaction/${transaction.hash} (it can take a few minutes before the transaction appears in the Explorer)`,
    )
  }

  simpleValidate(
    toAddress: string,
    amountInOre: number,
    feeInOre: number,
    expirationSequence: number | null | undefined,
    balance: number,
  ): void {
    // if (!isValidPublicAddress(toAddress)) {
    //   this.error(`${toAddress} A valid public address is required`)
    // }

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
}
