/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CurrencyUtils, Transaction } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'

export class MultisigSign extends IronfishCommand {
  static description = 'Aggregate signature shares from participants to sign a transaction'
  static hidden = true

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      char: 'f',
      description: 'Account to use when aggregating signature shares',
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
      description: 'Participant signature share',
      multiple: true,
    }),
    broadcast: Flags.boolean({
      default: true,
      allowNo: true,
      description: 'Broadcast the transaction to the network after signing',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(MultisigSign)

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

    const response = await client.wallet.multisig.aggregateSignatureShares({
      account: flags.account,
      unsignedTransaction,
      signingPackage,
      signatureShares,
    })

    const bytes = Buffer.from(response.content.transaction, 'hex')
    const transaction = new Transaction(bytes)

    CliUx.ux.action.stop()

    if (flags.broadcast && response.content.accepted === false) {
      this.warn(
        `Transaction '${transaction.hash().toString('hex')}' was not accepted into the mempool`,
      )
    }

    if (flags.broadcast && response.content.broadcasted === false) {
      this.warn(`Transaction '${transaction.hash().toString('hex')}' failed to broadcast`)
    }

    this.log(`Hash: ${transaction.hash().toString('hex')}`)
    this.log(`Fee: ${CurrencyUtils.renderIron(transaction.fee(), true)}`)
  }
}
