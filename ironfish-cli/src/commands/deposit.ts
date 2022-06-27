/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  Assert,
  displayIronAmountWithCurrency,
  ironToOre,
  isValidAmount,
  MINIMUM_IRON_AMOUNT,
  oreToIron,
  RpcClient,
  WebApi,
} from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../command'
import { RemoteFlags } from '../flags'
import { ProgressBar } from '../types'

const REGISTER_URL = 'https://testnet.ironfish.network/signup'
const IRON_TO_SEND = 0.1

export default class Bank extends IronfishCommand {
  static description = 'Deposit $IRON for testnet points'

  client: RpcClient | null = null
  api: WebApi | null = new WebApi()

  static flags = {
    ...RemoteFlags,
    fee: Flags.integer({
      char: 'f',
      default: 1,
      description: `the fee amount in ORE, minimum of 1. 1 ORE is equal to ${MINIMUM_IRON_AMOUNT} IRON`,
    }),
    expirationSequenceDelta: Flags.integer({
      char: 'e',
      description: 'max number of blocks for the transaction to wait before expiring',
    }),
    account: Flags.string({
      char: 'a',
      parse: (input) => Promise.resolve(input.trim()),
      description: 'the account to send money from',
    }),
    confirm: Flags.boolean({
      default: false,
      description: 'confirm without asking',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(Bank)

    this.client = await this.sdk.connectRpc()
    this.api = new WebApi()

    const fee = flags.fee
    const feeInIron = oreToIron(fee)
    const expirationSequenceDelta = flags.expirationSequenceDelta

    const accountName =
      flags.account || (await this.client.getDefaultAccount()).content.account?.name

    if (!accountName) {
      this.log(
        'Error fetching account name. Please use --account or make sure your default account is set properly.',
      )
      this.exit(1)
    }
    Assert.isNotUndefined(accountName)

    const bankDepositAddress = await this.api.getDepositAddress()

    if (!bankDepositAddress) {
      this.log('Error fetching deposit address. Please try again later.')
      this.exit(1)
    }

    const graffiti = (await this.client.getConfig({ name: 'blockGraffiti' })).content
      .blockGraffiti

    if (!graffiti) {
      this.log(
        `No graffiti found. Register at ${REGISTER_URL} then run \`ironfish testnet\` to configure your graffiti`,
      )
      this.exit(1)
    }
    Assert.isNotUndefined(graffiti)

    const { canSend, errorReason } = await this.verifyCanSend(flags, graffiti)
    if (!canSend) {
      Assert.isNotNull(errorReason)
      this.log(errorReason)
      this.exit(1)
    }

    const balanceResp = await this.client.getAccountBalance({ account: accountName })
    const confirmedBalance = Number(balanceResp.content.confirmed)
    if (confirmedBalance < ironToOre(IRON_TO_SEND) + fee) {
      const balance = oreToIron(confirmedBalance)
      const required = IRON_TO_SEND + feeInIron
      this.log(`Insufficient balance: ${balance}. Required: ${required}`)
      this.exit(1)
    }

    const newBalance = oreToIron(confirmedBalance - ironToOre(IRON_TO_SEND) - fee)

    const displayAmount = displayIronAmountWithCurrency(IRON_TO_SEND, true)
    const displayFee = displayIronAmountWithCurrency(feeInIron, true)
    const displayNewBalance = displayIronAmountWithCurrency(newBalance, true)
    if (!flags.confirm) {
      this.log(`
You are about to send ${displayAmount} plus a transaction fee of ${displayFee} to the Iron Fish deposit account.
Your remaining balance after this transaction will be ${displayNewBalance}.
The memo will contain the graffiti "${graffiti}".

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
      const result = await this.client.sendTransaction({
        fromAccountName: accountName,
        receives: [
          {
            publicAddress: bankDepositAddress,
            amount: ironToOre(IRON_TO_SEND).toString(),
            memo: graffiti,
          },
        ],
        fee: fee.toString(),
        expirationSequenceDelta: expirationSequenceDelta,
      })

      stopProgressBar()

      const transaction = result.content
      this.log(`
Depositing ${displayIronAmountWithCurrency(IRON_TO_SEND, true)} from ${
        transaction.fromAccountName
      }
Transaction Hash: ${transaction.hash}
Transaction fee: ${displayIronAmountWithCurrency(feeInIron, true)}

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

  private async verifyCanSend(
    flags: Record<string, unknown>,
    graffiti: string,
  ): Promise<{ canSend: boolean; errorReason: string | null }> {
    Assert.isNotNull(this.client)
    Assert.isNotNull(this.api)

    const status = await this.client.status()
    if (!status.content.blockchain.synced) {
      return {
        canSend: false,
        errorReason: `Your node must be synced with the Iron Fish network to send a transaction. Please try again later`,
      }
    }

    let user
    try {
      user = await this.api.findUser({ graffiti })
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.error(error.message)
      }

      return {
        canSend: false,
        errorReason: `There is a problem with the Iron Fish API. Please try again later.`,
      }
    }

    if (!user) {
      return {
        canSend: false,
        errorReason: `Graffiti not registered. Register at ${REGISTER_URL} and try again`,
      }
    }

    const expirationSequenceDelta = flags.expirationSequenceDelta as number | undefined
    if (expirationSequenceDelta !== undefined && expirationSequenceDelta < 0) {
      return {
        canSend: false,
        errorReason: `Expiration sequence delta must be non-negative`,
      }
    }

    if (expirationSequenceDelta !== undefined && expirationSequenceDelta > 120) {
      return {
        canSend: false,
        errorReason: 'Expiration sequence delta should not be above 120 blocks',
      }
    }

    const fee = flags.fee as number
    if (!isValidAmount(fee)) {
      return {
        canSend: false,
        errorReason: `The minimum fee is ${displayIronAmountWithCurrency(
          MINIMUM_IRON_AMOUNT,
          false,
        )}`,
      }
    }

    return { canSend: true, errorReason: null }
  }
}
