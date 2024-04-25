/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CliUx } from '@oclif/core'
import { IronfishCommand } from '../../../../command'
import { RemoteFlags } from '../../../../flags'

export class MultisigParticipants extends IronfishCommand {
  static description = 'List out all the participant names and identities'

  static flags = {
    ...RemoteFlags,
  }

  async start(): Promise<void> {
    const client = await this.sdk.connectRpc()
    const response = await client.wallet.multisig.getIdentities()

    const participants = []
    for (const { name, identity } of response.content.identities) {
      participants.push({
        name,
        value: identity,
      })
    }

    // sort identities by name
    participants.sort((a, b) => a.name.localeCompare(b.name))

    CliUx.ux.table(
      participants,
      {
        name: {
          header: 'Participant Name',
          get: (p) => p.name,
        },
        identity: {
          header: 'Identity',
          get: (p) => p.value,
        },
      },
      {
        'no-truncate': true,
      },
    )
  }
}
