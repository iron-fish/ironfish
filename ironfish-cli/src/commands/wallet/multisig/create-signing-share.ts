/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'

export class CreateSigningShareCommand extends IronfishCommand {
  static description = `Creates a signing share for a participant for a given transaction`
  static hidden = true

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      char: 'a',
      description: 'The account from which the signing share will be created',
      required: false,
    }),
    unsignedTransaction: Flags.string({
      char: 'u',
      description: 'The unsigned transaction for which the signing share will be created',
      required: true,
    }),
    signingPackage: Flags.string({
      char: 's',
      description: 'The signing package for which the signing share will be created',
      required: true,
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(CreateSigningShareCommand)
    const signingPackage = flags.signingPackage

    const client = await this.sdk.connectRpc()
    // TODO(andrea): use flags.transaction to create commiment when we incorportate deterministic nonces
    // set required to true as well
    const signingShareResponse = await client.wallet.multisig.createSigningShare({
      account: flags.account,
      unsignedTransaction: flags.unsignedTransaction,
      signingPackage,
      seed: 0,
    })
    this.log('Signing Share:\n')
    this.log(JSON.stringify(signingShareResponse.content))
  }
}
