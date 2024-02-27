/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'

export class MultisigIdentity extends IronfishCommand {
  static description = `Retrieve a multisig identity`
  static hidden = true

  static flags = {
    ...RemoteFlags,
    name: Flags.string({
      char: 'n',
      description: 'Name of the identity',
      required: true,
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(MultisigIdentity)

    const client = await this.sdk.connectRpc()

    const response = await client.wallet.multisig.getIdentity({ name: flags.name })

    this.log('Identity:')
    this.log(response.content.identity)
  }
}
