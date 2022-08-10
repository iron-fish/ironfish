/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { InputValidator, IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class UseCommand extends IronfishCommand {
  static description = 'Change the default account used by all commands'

  static args = [
    {
      name: 'name',
      required: true,
      description: 'name of the account',
    },
  ]

  static flags = {
    ...RemoteFlags,
  }

  async start(): Promise<void> {
    const { args } = await this.parse(UseCommand)
    const name = (args.name as string).trim()

    // validates account name
    if (InputValidator.accountName.test(name)) {
      this.error('Invalid account name')
    }

    const client = await this.sdk.connectRpc()
    await client.useAccount({ name })
    this.log(`The default account is now: ${name}`)
  }
}
