/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'

export class MultiSigSign extends IronfishCommand {
  static description = `Sign a transaction`
  static hidden = true

  static flags = {
    ...RemoteFlags,
    publicKeyPackage: Flags.string({
      char: 'k',
      description: 'Public key package',
    }),
    unsignedTransaction: Flags.string({
      char: 'u',
      description: 'Unsigned transaction',
    }),
    signingPackage: Flags.string({
      char: 's',
      description: 'Signing package',
    }),
    participant: Flags.string({
      char: 'p',
      description: 'Participant',
      multiple: true,
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(MultiSigSign)

    const publicKeyPackage =
      flags.publicKeyPackage?.trim() ??
      (await CliUx.ux.prompt('Enter the public key package', { required: true }))

    this.log(publicKeyPackage)

    const unsignedTransaction =
      flags.unsignedTransaction?.trim() ??
      (await CliUx.ux.prompt('Enter the unsigned transaction', { required: true }))

    this.log(unsignedTransaction)

    const signingPackage =
      flags.signingPackage?.trim() ??
      (await CliUx.ux.prompt('Enter the signing package', { required: true }))

    this.log(signingPackage)

    if (!flags.participant) {
      this.error('At least one participant is required')
    }
  }
}
