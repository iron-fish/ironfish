/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'
import { longPrompt } from '../../../utils/longPrompt'

export class CreateSigningPackage extends IronfishCommand {
  static description = `Creates a signing package for a given transaction for a multisig account`
  static hidden = true

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      char: 'f',
      description: 'The account to use to verify commitments',
      required: false,
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
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(CreateSigningPackage)

    let unsignedTransaction = flags.unsignedTransaction?.trim()

    if (!unsignedTransaction) {
      unsignedTransaction = await longPrompt('Enter the unsigned transaction: ', {
        required: true,
      })
    }

    let commitments = flags.commitment
    if (!commitments) {
      const input = await longPrompt('Enter the signing commitments separated by commas', {
        required: true,
      })
      commitments = input.split(',')
    }
    commitments = commitments.map((s) => s.trim())

    const client = await this.sdk.connectRpc()

    const signingPackageResponse = await client.wallet.multisig.createSigningPackage({
      account: flags.account,
      unsignedTransaction,
      commitments,
    })

    this.log(`Signing Package for commitments from ${commitments.length} participants:\n`)
    this.log(signingPackageResponse.content.signingPackage)
  }
}
