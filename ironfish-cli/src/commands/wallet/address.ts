/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '@ironfish/sdk'
import { Args, Flags, ux } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class AddressCommand extends IronfishCommand {
  static description = `Display your account address

  The address for an account is the accounts public key, see more here: https://ironfish.network/docs/whitepaper/5_account`

  static flags = {
    ...RemoteFlags,
    passphrase: Flags.string({
      required: false,
      description: 'Passphrase for wallet',
    }),
    timeout: Flags.integer({
      required: false,
      description: 'Timeout to unlock for wallet',
    }),
  }

  static args = {
    account: Args.string({
      required: false,
      description: 'Name of the account to get the address for',
    }),
  }

  async start(): Promise<void> {
    const { args, flags } = await this.parse(AddressCommand)
    const { account } = args

    const client = await this.sdk.connectRpc()

    let passphrase = flags.passphrase
    const status = await client.wallet.getNodeStatus()
    if (status.content.accounts.locked && !passphrase) {
      passphrase = await ux.prompt('Enter your passphrase to unlock the wallet', {
        required: true,
      })
    }

    if (status.content.accounts.locked) {
      Assert.isNotUndefined(passphrase)
      await client.wallet.unlock({
        passphrase,
        timeout: flags.timeout,
      })
    }

    const response = await client.wallet.getAccountPublicKey({
      account: account,
    })

    if (!response) {
      this.error(`An error occurred while fetching the public key.`)
    }

    this.log(`Account: ${response.content.account}, public key: ${response.content.publicKey}`)
  }
}
