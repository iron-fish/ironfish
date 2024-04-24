/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  ErrorUtils,
  RawTransaction,
  RawTransactionSerde,
  RpcClient,
  UnsignedTransaction,
} from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import inquirer from 'inquirer'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'
import { longPrompt } from '../../../utils/longPrompt'
import {
  renderRawTransactionDetails,
  renderUnsignedTransactionDetails,
} from '../../../utils/transaction'

export class TransactionViewCommand extends IronfishCommand {
  static description = `View transaction details`

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      char: 'f',
      description: 'The name of the account to use to for viewing transaction details',
    }),
    transaction: Flags.string({
      char: 't',
      description: 'The hex-encoded raw transaction or unsigned transaction to view',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(TransactionViewCommand)

    const client = await this.sdk.connectRpc()

    const account = flags.account ?? (await this.selectAccount(client))

    let transactionString = flags.transaction as string
    if (!transactionString) {
      transactionString = await longPrompt(
        'Enter the hex-encoded raw transaction or unsigned transaction to view',
        {
          required: true,
        },
      )
    }

    const rawTransaction = this.tryDeserializeRawTransaction(transactionString)
    if (rawTransaction) {
      return await renderRawTransactionDetails(client, rawTransaction, account, this.logger)
    }

    const unsignedTransaction = this.tryDeserializeUnsignedTransaction(transactionString)
    if (unsignedTransaction) {
      return await renderUnsignedTransactionDetails(
        client,
        unsignedTransaction,
        account,
        this.logger,
      )
    }

    this.error(
      'Unable to deserialize transaction input as a raw transacton or an unsigned transaction',
    )
  }

  async selectAccount(client: Pick<RpcClient, 'wallet'>): Promise<string> {
    const accountsResponse = await client.wallet.getAccounts()

    const choices = []
    for (const account of accountsResponse.content.accounts) {
      choices.push({
        account,
        value: account,
      })
    }

    choices.sort()

    const selection = await inquirer.prompt<{
      account: string
    }>([
      {
        name: 'account',
        message: 'Select account',
        type: 'list',
        choices,
      },
    ])

    return selection.account
  }

  tryDeserializeRawTransaction(transaction: string): RawTransaction | undefined {
    try {
      return RawTransactionSerde.deserialize(Buffer.from(transaction, 'hex'))
    } catch (e) {
      this.logger.debug(
        `Failed to deserialize transaction as RawTransaction: ${ErrorUtils.renderError(e)}`,
      )

      return undefined
    }
  }

  tryDeserializeUnsignedTransaction(transaction: string): UnsignedTransaction | undefined {
    try {
      return new UnsignedTransaction(Buffer.from(transaction, 'hex'))
    } catch (e) {
      this.logger.debug(
        `Failed to deserialize transaction as UnsignedTransaction: ${ErrorUtils.renderError(
          e,
        )}`,
      )

      return undefined
    }
  }
}
