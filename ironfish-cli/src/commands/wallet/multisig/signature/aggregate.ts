/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CurrencyUtils, Transaction } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../../../command'
import { RemoteFlags } from '../../../../flags'
import { longPrompt } from '../../../../utils/longPrompt'
import { MultisigTransactionJson } from '../../../../utils/multisig'
import { watchTransaction } from '../../../../utils/transaction'

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
    watch: Flags.boolean({
      default: false,
      description: 'Wait for the transaction to be confirmed',
    }),
    path: Flags.string({
      description: 'Path to a JSON file containing multisig transaction data',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(MultisigSign)

    const loaded = await MultisigTransactionJson.load(this.sdk.fileSystem, flags.path)
    const options = MultisigTransactionJson.resolveFlags(flags, loaded)

    let signingPackage = options.signingPackage
    if (!signingPackage) {
      signingPackage = await longPrompt('Enter the signing package', { required: true })
    }

    let signatureShares = options.signatureShare
    if (!signatureShares) {
      const input = await longPrompt('Enter the signature shares separated by commas', {
        required: true,
      })
      signatureShares = input.split(',')
    }
    signatureShares = signatureShares.map((s) => s.trim())

    CliUx.ux.action.start('Signing the multisig transaction')

    const client = await this.sdk.connectRpc()

    const response = await client.wallet.multisig.aggregateSignatureShares({
      account: flags.account,
      broadcast: flags.broadcast,
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

    this.log(`Transaction: ${response.content.transaction}`)
    this.log(`Hash: ${transaction.hash().toString('hex')}`)
    this.log(`Fee: ${CurrencyUtils.renderIron(transaction.fee(), true)}`)

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
