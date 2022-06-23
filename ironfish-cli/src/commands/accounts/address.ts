/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class AddressCommand extends IronfishCommand {
  static aliases = ['accounts:publickey']
  static description = `Display or regenerate your account address

  The address for an account is the accounts public key, see more here: https://ironfish.network/docs/whitepaper/5_account`

  static flags = {
    ...RemoteFlags,
    generate: Flags.boolean({
      char: 'g',
      default: false,
      description: 'generate a new address',
    }),
  }

  static args = [
    {
      name: 'account',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'name of the account to get the address for',
    },
  ]

  async start(): Promise<void> {
    const { args, flags } = await this.parse(AddressCommand)
    const account = args.account as string | undefined

    const client = await this.sdk.connectRpc()

    const response = await client.getAccountPublicKey({
      account: account,
      generate: flags.generate,
    })

    if (!response) {
      this.error(`An error occurred while fetching the public key.`)
    }

    this.log(`Account: ${response.content.account}, public key: ${response.content.publicKey}`)
  }
}
