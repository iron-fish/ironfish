/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'

export class CreateSigningCommitmentCommand extends IronfishCommand {
  static description = 'Create a signing commitment from a participant for a given transaction'

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      char: 'f',
      description:
        'The account to use for generating the commitment, must be a multisig participant account',
      required: false,
    }),
    // TODO(andrea): add transaction flag when we incorporate deterministic nonces
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(CreateSigningCommitmentCommand)

    const client = await this.sdk.connectRpc()
    // TODO(andrea): use flags.transaction to create commiment when we incorportate deterministic nonces
    // set required to true as well
    const response = await client.wallet.multisig.createSigningCommitment({
      account: flags.account,
      seed: 0,
    })

    this.log('Commitment:\n')
    this.log(response.content.commitment)
  }
}
