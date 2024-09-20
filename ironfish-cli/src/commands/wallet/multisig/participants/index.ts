/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IronfishCommand } from '../../../../command'
import { RemoteFlags } from '../../../../flags'
import * as ui from '../../../../ui'

export class MultisigParticipants extends IronfishCommand {
  static description = 'List out all the participant names and identities'

  static flags = {
    ...RemoteFlags,
  }

  async start(): Promise<void> {
    const client = await this.connectRpc()
    await ui.checkWalletUnlocked(client)

    const response = await client.wallet.multisig.getIdentities()

    const participants: {
      name: string
      value: string
      hasSecret: boolean
    }[] = []
    for (const { name, identity, hasSecret } of response.content.identities) {
      participants.push({
        name,
        hasSecret: hasSecret,
        value: identity,
      })
    }

    // sort identities by name
    participants.sort((a, b) => a.name.localeCompare(b.name))

    ui.table(
      participants,
      {
        name: {
          header: 'Participant Name',
          get: (p) => p.name,
        },
        hasSecret: {
          header: 'Has Secret',
          get: (p) => (p.hasSecret ? 'Yes' : 'No'),
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
