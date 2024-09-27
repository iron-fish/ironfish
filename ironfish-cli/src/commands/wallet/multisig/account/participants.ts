/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../../command'
import { RemoteFlags } from '../../../../flags'
import * as ui from '../../../../ui'

export class MultisigAccountParticipants extends IronfishCommand {
  static description = `List all participant identities in the group for a multisig account`

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      char: 'a',
      description: 'Name of the account to list group identities for',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(MultisigAccountParticipants)

    const client = await this.connectRpc()
    await ui.checkWalletUnlocked(client)

    const accountIdentities = (
      await client.wallet.multisig.getAccountIdentities({
        account: flags.account,
      })
    ).content.identities

    const participants = (await client.wallet.multisig.getIdentities()).content.identities

    const matchingIdentities = participants.filter((identity) =>
      accountIdentities.includes(identity.identity),
    )

    let participant: string | undefined
    if (matchingIdentities.length === 1) {
      participant = matchingIdentities[0].identity
      this.log(`Your identity:\n${participant}`)
      this.log('\nOther participating identities:')
    }

    for (const identity of accountIdentities) {
      if (participant && participant === identity) {
        continue
      }
      this.log(identity)
    }
  }
}
