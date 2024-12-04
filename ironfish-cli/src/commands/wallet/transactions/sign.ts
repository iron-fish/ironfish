/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { CurrencyUtils, RpcClient, Transaction, UnsignedTransaction } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'
import { LedgerSingleSigner } from '../../../ledger'
import * as ui from '../../../ui'
import { renderUnsignedTransactionDetails, watchTransaction } from '../../../utils/transaction'

export class TransactionsSignCommand extends IronfishCommand {
  static description = `sign an unsigned transaction`

  static hiddenAliases = ['wallet:sign']

  static flags = {
    ...RemoteFlags,
    unsignedTransaction: Flags.string({
      char: 'u',
      description: 'Unsigned transaction to sign.',
    }),
    ledger: Flags.boolean({
      description: 'Sign with a ledger device',
      default: false,
    }),
    broadcast: Flags.boolean({
      default: false,
      description: 'Broadcast the transaction to the network after signing',
    }),
    watch: Flags.boolean({
      default: false,
      description: 'Wait for the transaction to be confirmed',
      dependsOn: ['broadcast'],
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(TransactionsSignCommand)
    const client = await this.connectRpc()
    await ui.checkWalletUnlocked(client)

    if (!flags.broadcast && flags.watch) {
      this.error('Cannot use --watch without --broadcast')
    }

    let unsignedTransactionHex = flags.unsignedTransaction
    if (!unsignedTransactionHex) {
      unsignedTransactionHex = await ui.longPrompt('Enter the unsigned transaction', {
        required: true,
      })
    }

    let signedTransaction: string
    let account: string

    const unsignedTransaction = new UnsignedTransaction(
      Buffer.from(unsignedTransactionHex, 'hex'),
    )
    await renderUnsignedTransactionDetails(client, unsignedTransaction, undefined, this.logger)

    if (flags.ledger) {
      const response = await this.signWithLedger(client, unsignedTransactionHex)
      signedTransaction = response.transaction
      account = response.account
    } else {
      const response = await this.signWithAccount(client, unsignedTransactionHex)
      signedTransaction = response.transaction
      account = response.account
    }

    const response = await client.wallet.addTransaction({
      transaction: signedTransaction,
      broadcast: flags.broadcast,
    })

    const bytes = Buffer.from(signedTransaction, 'hex')
    const transaction = new Transaction(bytes)

    this.log(`\nSigned Transaction: ${signedTransaction}`)
    this.log(`\nHash: ${transaction.hash().toString('hex')}`)
    this.log(`Fee: ${CurrencyUtils.render(transaction.fee(), true)}`)

    if (flags.broadcast && response.content.accepted === false) {
      this.error(
        `Transaction '${transaction.hash().toString('hex')}' was not accepted into the mempool`,
      )
    }

    if (flags.watch) {
      this.log('')

      await watchTransaction({
        client,
        logger: this.logger,
        account: account,
        hash: transaction.hash().toString('hex'),
      })
    }
  }

  private async signWithAccount(client: RpcClient, unsignedTransaction: string) {
    const response = await client.wallet.signTransaction({
      unsignedTransaction: unsignedTransaction,
    })

    return {
      transaction: response.content.transaction,
      account: response.content.account,
    }
  }

  private async signWithLedger(client: RpcClient, unsignedTransaction: string) {
    const ledger = new LedgerSingleSigner()

    const signature = (
      await ui.ledger({
        ledger,
        message: 'Sign Transaction',
        approval: true,
        action: () => ledger.sign(unsignedTransaction),
      })
    ).toString('hex')

    this.log(`\nSignature: ${signature}`)

    const addSignatureResponse = await client.wallet.addSignature({
      unsignedTransaction,
      signature,
    })

    return {
      transaction: addSignatureResponse.content.transaction,
      account: addSignatureResponse.content.account,
    }
  }
}
