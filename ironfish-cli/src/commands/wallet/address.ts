/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Args } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { JsonFlags, RemoteFlags } from '../../flags'
import * as ui from '../../ui'

export class AddressCommand extends IronfishCommand {
  static description = `show the account's public address

  The address for an account is the accounts public key, see more here: https://ironfish.network/docs/whitepaper/5_account`

  static enableJsonFlag = true

  static args = {
    account: Args.string({
      required: false,
      description: 'Name of the account to get the address for',
    }),
  }

  static flags = {
    ...RemoteFlags,
    ...JsonFlags,
  }

  async start(): Promise<unknown> {
    const { args } = await this.parse(AddressCommand)

    const client = await this.connectRpc()
    await ui.checkWalletUnlocked(client)

    const response = await client.wallet.getAccountPublicKey({
      account: args.account,
    })

    this.log(
      ui.card({
        Account: response.content.account,
        Address: response.content.publicKey,
      }),
    )

    return response.content
  }
}
