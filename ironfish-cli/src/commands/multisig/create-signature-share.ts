/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { UnsignedTransaction } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { longPrompt } from '../../utils/longPrompt'
import { renderUnsignedTransactionDetails } from '../../utils/transaction'

export class CreateSignatureShareCommand extends IronfishCommand {
  static description = `Creates a signature share for a participant for a given transaction`
  static hidden = true

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      char: 'f',
      description: 'The account from which the signature share will be created',
      required: false,
    }),
    signingPackage: Flags.string({
      char: 's',
      description: 'The signing package for which the signature share will be created',
      required: false,
    }),
    confirm: Flags.boolean({
      default: false,
      description: 'Confirm creating signature share without confirming',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(CreateSignatureShareCommand)
    let signingPackage = flags.signingPackage?.trim()

    if (!signingPackage) {
      signingPackage = await longPrompt('Enter the signing package: ')
    }

    const client = await this.sdk.connectRpc()
    const unsignedTransaction = UnsignedTransaction.fromSigningPackage(signingPackage)

    await renderUnsignedTransactionDetails(
      client,
      unsignedTransaction,
      flags.account,
      this.logger,
    )

    if (!flags.confirm) {
      const confirmed = await CliUx.ux.confirm('Confirm new signature share creation (Y/N)')
      if (!confirmed) {
        this.error('Creating signature share aborted')
      }
    }

    const signatureShareResponse = await client.wallet.multisig.createSignatureShare({
      account: flags.account,
      signingPackage,
    })

    this.log('Signature Share:\n')
    this.log(signatureShareResponse.content.signatureShare)
  }
}
