/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'

export class CreateSigningPackage extends IronfishCommand {
  static description = `Creates a signing package for a given transaction for a multisig account`
  static hidden = true

  static flags = {
    ...RemoteFlags,
    unsignedTransaction: Flags.string({
      char: 'u',
      description: 'The unsigned transaction for which the signing share will be created',
      required: true,
    }),
    commitment: Flags.string({
      char: 'c',
      description:
        'The signing commitments from participants to be used for creating the signing package',
      required: true,
      multiple: true,
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(CreateSigningPackage)

    const client = await this.sdk.connectRpc()

    const signingPackageResponse = await client.wallet.multisig.createSigningPackage({
      unsignedTransaction: flags.unsignedTransaction,
      commitments: flags.commitment,
    })

    this.log(`Signing Package for commitments from ${flags.commitment.length} participants:\n`)
    this.log(signingPackageResponse.content.signingPackage)
  }
}
