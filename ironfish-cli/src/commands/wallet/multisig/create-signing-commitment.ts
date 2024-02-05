/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert, RpcAccountImport } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'

export class CreateSigningCommitmentCommand extends IronfishCommand {
  static description = `Attempt to connect to a peer through websockets`

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      char: 'a',
      description: 'The account to use for the transaction',
      required: false,
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(CreateSigningCommitmentCommand)

    const client = await this.sdk.connectRpc()

    const accountResponse = await client.wallet.exportAccount(
      flags.account ? { account: flags.account } : {},
    )
    const account = accountResponse.content.account as RpcAccountImport

    if (!account.multiSigKeys) {
      this.error(`Account "${account.name}" is not a multisig account`)
    }

    if (!account.multiSigKeys.keyPackage) {
      this.error(`Account "${account.name}" does not have a key package`)
    }

    Assert.isNotNull(account.multiSigKeys, 'Account is not a multisig account')
    // TODO(andrea): use flags.transaction to create commiment when we incorportate deterministic nonces
    // set required to true as well
    const commitmentResponse = await client.multisig.createSigningCommitment({
      keyPackage: account.multiSigKeys.keyPackage,
      seed: 0,
    })

    const commitment = {
      identifier: account.multiSigKeys.identifier,
      commitment: commitmentResponse.content,
    }

    this.log('Commitment:\n')
    this.log(JSON.stringify(commitment))
  }
}
