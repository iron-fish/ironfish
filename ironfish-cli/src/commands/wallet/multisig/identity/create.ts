/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ParticipantSecret } from '@ironfish/rust-nodejs'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../../command'
import { RemoteFlags } from '../../../../flags'

export class MultisigIdentityCreate extends IronfishCommand {
  static description = `Create a multisig identity`
  static hidden = true

  static flags = {
    ...RemoteFlags,
    name: Flags.string({
      char: 'n',
      description: 'Name to use for the coordinator',
      required: true,
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(MultisigIdentityCreate)

    const client = await this.sdk.connectRpc()
    const response = await client.wallet.multisig.createSecret({ name: flags.name })

    const secret = new ParticipantSecret(Buffer.from(response.content.secret, 'hex'))
    const identity = secret.toIdentity()

    this.log('Identity:')
    this.log(identity.serialize().toString('hex'))
  }
}
