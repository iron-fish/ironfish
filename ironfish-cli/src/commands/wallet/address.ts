/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Args } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class AddressCommand extends IronfishCommand {
  static description = `Display your account address

  The address for an account is the accounts public key, see more here: https://ironfish.network/docs/whitepaper/5_account`

  static flags = {
    ...RemoteFlags,
  }

  static args = {
    account: Args.string({
      required: false,
      description: 'Name of the account to get the address for',
    }),
  }

  async start(): Promise<void> {
    const { args } = await this.parse(AddressCommand)
    const { account } = args

    const client = await this.sdk.connectRpc()

    const response = await client.wallet.getAccountPublicKey({
      account: account,
    })

    if (!response) {
      this.error(`An error occurred while fetching the public key.`)
    }

    this.log(`Account:              ${response.content.account}`)
    this.log(`Iron Fish Public Key: ${response.content.publicKey}`)
    this.log(`EVM Public Address:   ${response.content.evmPublicAddress}`)
  }
}
