/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'

interface SigningShare {
  identifier: string
  signingShare: string
}
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
      char: 'p',
      description: 'Signing package',
    }),
    signingShare: Flags.string({
      char: 's',
      description: 'Signing share',
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

    if (!flags.signingShare) {
      this.error('At least one signingShare is required')
    }

    const signingShares: SigningShare[] = flags.signingShare.map(
      (ss) => JSON.parse(ss) as SigningShare,
    )

    this.log(signingShares.join('\n'))

    const client = await this.sdk.connectRpc()

    const response = await client.multisig.aggregateSigningShares({
      publicKeyPackage,
      unsignedTransaction,
      signingPackage,
      signingShares,
    })

    this.log('Transaction response: ')
    this.log(response.content.transaction)
  }
}
