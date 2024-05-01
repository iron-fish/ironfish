/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Transaction } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'
import { longPrompt } from '../../../utils/input'
import { Ledger } from '../ledger'

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
    submit: Flags.boolean({
      char: 's',
      default: true,
      allowNo: true,
      description: 'Submit the signed transaction to the network',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(LedgerSign)
    const client = await this.sdk.connectRpc()
    let from = flags.account

    if (!from) {
      const response = await client.wallet.getDefaultAccount()

      if (!response.content.account) {
        this.error(
          `No account is currently active.
           Use ironfish wallet:create <name> to first create an account`,
        )
      }

      from = response.content.account.name
    }

    const publicKey = (
      await client.wallet.getAccountPublicKey({
        account: from,
      })
    ).content.publicKey

    const ledger = new Ledger(this.logger)
    await ledger.connect()
    const publicAddress = await ledger.publicAddress()

    if (publicAddress !== publicKey) {
      this.error(
        `The public key on the ledger device does not match the public key of the account ${from}`,
      )
    }

    let unsignedTransaction = flags.unsignedTransaction
    if (!unsignedTransaction) {
      unsignedTransaction = await longPrompt('Enter the unsigned transaction', {
        required: true,
      })
    }

    const signature = (await ledger.sign(unsignedTransaction)).toString('hex')

    if (!flags.submit) {
      return
    }

    const response = await client.wallet.addSignatureToTransaction({
      unsignedTransaction,
      signature,
      broadcast: true,
    })

    const transction = new Transaction(Buffer.from(response.content.transaction, 'hex'))
    this.logger.log('Transaction summary:')
    transction.hash()

    this.logger.log(`Transaction hash: ${transction.hash().toString('hex')}`)

    this.logger.log('====================================')
    this.logger.log(response.content.transaction)
    this.logger.log(response.content.accepted ? 'Transaction accepted' : 'Transaction rejected')
    this.logger.log(
      response.content.broadcasted ? 'Transaction broadcasted' : 'Transaction not broadcasted',
    )
  }
}
