/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  ErrorUtils,
  RawTransaction,
  RawTransactionSerde,
  Transaction,
  UnsignedTransaction,
} from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'
import * as ui from '../../../ui'
import {
  renderRawTransactionDetails,
  renderTransactionDetails,
  renderUnsignedTransactionDetails,
} from '../../../utils/transaction'

export class TransactionsDecodeCommand extends IronfishCommand {
  static description = `show an encoded transaction's details`
  static hiddenAliases = ['wallet:transaction:view']

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      char: 'f',
      description: 'Name of the account to use to for viewing transaction details',
    }),
    transaction: Flags.string({
      char: 't',
      description:
        'The hex-encoded transaction, raw transaction, or unsigned transaction to view',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(TransactionsDecodeCommand)

    const client = await this.connectRpc()
    await ui.checkWalletUnlocked(client)

    const account = flags.account ?? (await ui.accountPrompt(client))

    let transactionString = flags.transaction
    if (!transactionString) {
      transactionString = await ui.longPrompt(
        'Enter the hex-encoded transaction, raw transaction, or unsigned transaction to view',
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

    const transaction = this.tryDeserializeTransaction(transactionString)
    if (transaction) {
      return await renderTransactionDetails(client, transaction, account, this.logger)
    }

    this.error('Unable to deserialize transaction input')
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

  tryDeserializeTransaction(transaction: string): Transaction | undefined {
    try {
      return new Transaction(Buffer.from(transaction, 'hex'))
    } catch (e) {
      this.logger.debug(
        `Failed to deserialize transaction as Transaction: ${ErrorUtils.renderError(e)}`,
      )

      return undefined
    }
  }
}
