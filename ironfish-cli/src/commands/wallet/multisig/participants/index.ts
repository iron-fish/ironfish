/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../../command'
import { RemoteFlags } from '../../../../flags'

export class MultisigAccountParticipants extends IronfishCommand {
  static description = `List the participant identities for a multisig account`
  static hidden = true

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      char: 'f',
      description: 'The account to list identities for',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(MultisigAccountParticipants)

    const client = await this.sdk.connectRpc()

    const response = await client.wallet.multisig.getAccountIdentities({
      account: flags.account,
    })

    for (const identity of response.content.identities) {
      this.log(identity)
    }
  }
}
