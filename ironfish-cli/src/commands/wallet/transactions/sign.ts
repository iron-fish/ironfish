/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { CurrencyUtils, RpcClient, Transaction } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'
import * as ui from '../../../ui'
import { LedgerSingleSigner } from '../../../utils/ledger'
import { renderTransactionDetails, watchTransaction } from '../../../utils/transaction'

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

    let unsignedTransaction = flags.unsignedTransaction
    if (!unsignedTransaction) {
      unsignedTransaction = await ui.longPrompt('Enter the unsigned transaction', {
        required: true,
      })
    }

    let signedTransaction: string
    let account: string

    if (flags.ledger) {
      const response = await this.signWithLedger(client, unsignedTransaction)
      signedTransaction = response.transaction
      account = response.account
    } else {
      const response = await this.signWithAccount(client, unsignedTransaction)
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

    await renderTransactionDetails(client, transaction, account, this.logger)

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
    const ledger = new LedgerSingleSigner(this.logger)
    try {
      await ledger.connect()
    } catch (e) {
      if (e instanceof Error) {
        this.error(e.message)
      } else {
        throw e
      }
    }

    const signature = (await ledger.sign(unsignedTransaction)).toString('hex')

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
