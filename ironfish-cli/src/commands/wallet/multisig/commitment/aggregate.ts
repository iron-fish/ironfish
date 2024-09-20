/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../../command'
import { RemoteFlags } from '../../../../flags'
import * as ui from '../../../../ui'
import { MultisigTransactionJson } from '../../../../utils/multisig'

export class CreateSigningPackage extends IronfishCommand {
  static description = `Creates a signing package for a given transaction for a multisig account`

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      char: 'a',
      description: 'Name of the account to use when creating the signing package',
    }),
    unsignedTransaction: Flags.string({
      char: 'u',
      description: 'The unsigned transaction for which the signing share will be created',
    }),
    commitment: Flags.string({
      char: 'c',
      description:
        'The signing commitments from participants to be used for creating the signing package',
      multiple: true,
    }),
    path: Flags.string({
      description: 'Path to a JSON file containing multisig transaction data',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(CreateSigningPackage)

    const loaded = await MultisigTransactionJson.load(this.sdk.fileSystem, flags.path)
    const options = MultisigTransactionJson.resolveFlags(flags, loaded)

    const client = await this.connectRpc()
    await ui.checkWalletUnlocked(client)

    let unsignedTransaction = options.unsignedTransaction
    if (!unsignedTransaction) {
      unsignedTransaction = await ui.longPrompt('Enter the unsigned transaction', {
        required: true,
      })
    }

    let commitments = options.commitment
    if (!commitments) {
      const input = await ui.longPrompt('Enter the signing commitments, separated by commas', {
        required: true,
      })
      commitments = input.split(',')
    }
    commitments = commitments.map((s) => s.trim())

    const signingPackageResponse = await client.wallet.multisig.createSigningPackage({
      account: flags.account,
      unsignedTransaction,
      commitments,
    })

    this.log(`Signing Package for commitments from ${commitments.length} participants:\n`)
    this.log(signingPackageResponse.content.signingPackage)

    this.log()
    this.log('Next step:')
    this.log('Send the signing package to all of the participants who provided a commitment.')
  }
}
