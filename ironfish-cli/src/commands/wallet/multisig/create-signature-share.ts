/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Flags } from '@oclif/core'
import inquirer from 'inquirer'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'

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
    unsignedTransaction: Flags.string({
      char: 'u',
      description: 'The unsigned transaction for which the signature share will be created',
    }),
    signingPackage: Flags.string({
      char: 's',
      description: 'The signing package for which the signature share will be created',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(CreateSignatureShareCommand)

    const client = await this.sdk.connectRpc()
    // TODO(andrea): use flags.transaction to create commiment when we incorportate deterministic nonces
    // set required to true as well
    const unsignedTransaction = flags.unsignedTransaction
      ? flags.unsignedTransaction.trim()
      : await inquirer
          .prompt<{
            unsignedTransaction: string
          }>([
            {
              name: 'unsignedTransaction',
              message: `Enter the unsigned transaction: `,
              type: 'input',
            },
          ])
          .then((response) => response.unsignedTransaction.trim())
    const signatureShareResponse = await client.wallet.multisig.createSignatureShare({
      account: flags.account,
      unsignedTransaction,
      signingPackage: flags.signingPackage || '',
      seed: 0,
    })

    this.log('Signing Share:\n')
    this.log(signatureShareResponse.content.signatureShare)
  }
}
