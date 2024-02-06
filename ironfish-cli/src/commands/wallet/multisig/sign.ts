/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CurrencyUtils, Transaction } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'

export class MultiSigSign extends IronfishCommand {
  static description = 'Aggregate signing shares from participants to sign a transaction'
  static hidden = true

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      description: 'The account that created the raw transaction',
      required: false,
    }),
    unsignedTransaction: Flags.string({
      char: 'u',
      description: 'Unsigned transaction',
    }),
    signingPackage: Flags.string({
      char: 'p',
      description: 'Signing package',
    }),
    signatureShare: Flags.string({
      char: 's',
      description: 'Signing share',
      multiple: true,
    }),
    broadcast: Flags.boolean({
      default: true,
      allowNo: true,
      description: 'Broadcast the transaction after signing',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(MultiSigSign)

    const unsignedTransaction =
      flags.unsignedTransaction?.trim() ??
      (await CliUx.ux.prompt('Enter the unsigned transaction', { required: true }))

    const signingPackage =
      flags.signingPackage?.trim() ??
      (await CliUx.ux.prompt('Enter the signing package', { required: true }))

    let signatureShares = flags.signatureShare
    if (!signatureShares) {
      const input = await CliUx.ux.prompt('Enter the signature shares separated by commas', {
        required: true,
      })
      signatureShares = input.split(',')
    }
    signatureShares = signatureShares.map((s) => s.trim())

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

    const response = await client.wallet.multisig.aggregateSignatureShares({
      account,
      unsignedTransaction,
      signingPackage,
      signatureShares,
    })

    const bytes = Buffer.from(response.content.transaction, 'hex')
    const transaction = new Transaction(bytes)

    CliUx.ux.action.stop()

    if (response.content.accepted === false) {
      this.warn(
        `Transaction '${transaction.hash().toString('hex')}' was not accepted into the mempool`,
      )
    }

    if (response.content.broadcasted === false) {
      this.warn(`Transaction '${transaction.hash().toString('hex')}' failed to broadcast`)
    }

    this.log(`Hash: ${transaction.hash().toString('hex')}`)
    this.log(`Fee: ${CurrencyUtils.renderIron(transaction.fee(), true)}`)
  }
}
