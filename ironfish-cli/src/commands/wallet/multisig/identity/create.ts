/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ParticipantIdentity } from '@ironfish/rust-nodejs'
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
      description: 'Name to assoicate with the identity',
      required: true,
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(MultisigIdentityCreate)

    const client = await this.sdk.connectRpc()
    const response = await client.wallet.multisig.createIdentity({ name: flags.name })

    const identity = new ParticipantIdentity(Buffer.from(response.content.identity, 'hex'))

    this.log('Identity:')
    this.log(identity.serialize().toString('hex'))
  }
}
