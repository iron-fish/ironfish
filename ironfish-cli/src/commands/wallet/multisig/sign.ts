/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'
import { YupUtils } from '@ironfish/sdk'

interface SigningShare {
  identifier: string
  signingShare: string
}

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
    signingShare: Flags.string({
      char: 's',
      description: 'Signing share',
      multiple: true,
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(MultiSigSign)

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

    const response = await client.multisig.aggregateSigningShares({
      account,
      unsignedTransaction,
      signingPackage,
      signingShares,
    })

    // TODO: Decide on how to display the transaction information. Similar to the send command?
    this.log('Transaction response: ')
    this.log(response.content.transaction)

    // TODO: Do we now send the transaction?
  }
}
