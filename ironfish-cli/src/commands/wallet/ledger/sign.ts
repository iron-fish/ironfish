/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { CurrencyUtils, Transaction } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'
import { longPrompt } from '../../../utils/input'
import { Ledger } from '../../../utils/ledger'
import { watchTransaction } from '../../../utils/transaction'

export class LedgerSign extends IronfishCommand {
  static description = `Sign a unsigned transaction with a Ledger device`
  static hidden = true
  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      char: 'f',
      description: 'The account to send money from',
    }),
    unsignedTransaction: Flags.string({
      char: 'u',
      description: 'Unsigned transaction to sign.',
    }),
    broadcast: Flags.boolean({
      default: true,
      allowNo: true,
      description: 'Broadcast the transaction to the network after signing',
    }),
    watch: Flags.boolean({
      default: false,
      description: 'Wait for the transaction to be confirmed',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(LedgerSign)
    const client = await this.sdk.connectRpc()
    let account = flags.account

    if (!account) {
      const response = await client.wallet.getDefaultAccount()

      if (!response.content.account) {
        this.error(
          `No account is currently active.
            Use ironfish wallet:create <name> to first create an account`,
        )
      }

      account = response.content.account.name
    }

    const ledger = new Ledger(this.logger)
    await ledger.connect()
    const publicAddress = await ledger.getPublicAddress()

    const publicKey = (
      await client.wallet.getAccountPublicKey({
        account: account,
      })
    ).content.publicKey

    if (publicAddress !== publicKey) {
      this.error(
        `The public key on the ledger device does not match the public key of the account ${account}`,
      )
    }

    let unsignedTransaction = flags.unsignedTransaction
    if (!unsignedTransaction) {
      unsignedTransaction = await longPrompt('Enter the unsigned transaction', {
        required: true,
      })
    }

    const signature = (await ledger.sign(unsignedTransaction)).toString('hex')

    this.log(`Signature: ${signature}`)

    const addSignatureResponse = await client.wallet.addSignature({
      unsignedTransaction,
      signature,
    })

    const response = await client.wallet.addTransaction({
      transaction: addSignatureResponse.content.transaction,
      broadcast: flags.broadcast,
    })

    const bytes = Buffer.from(addSignatureResponse.content.transaction, 'hex')
    const transaction = new Transaction(bytes)

    if (flags.broadcast && response.content.accepted === false) {
      this.warn(
        `Transaction '${transaction.hash().toString('hex')}' was not accepted into the mempool`,
      )
    }

    this.log(`Transaction: ${addSignatureResponse.content.transaction}`)
    this.log(`Hash: ${transaction.hash().toString('hex')}`)
    this.log(`Fee: ${CurrencyUtils.render(transaction.fee(), true)}`)

    if (flags.watch) {
      this.log('')

      await watchTransaction({
        client,
        logger: this.logger,
        account: flags.account,
        hash: transaction.hash().toString('hex'),
      })
    }
  }
}
