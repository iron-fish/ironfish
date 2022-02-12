/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class RemoveCommand extends IronfishCommand {
  static description = `Permanently remove an account`

  static args = [
    {
      name: 'name',
      required: true,
      description: 'name of the account',
    },
  ]

  static flags = {
    ...RemoteFlags,
    confirm: Flags.boolean({
      description: 'suppress the confirmation prompt',
    }),
  }

  async start(): Promise<void> {
    const { args, flags } = await this.parse(RemoveCommand)
    const confirm = flags.confirm
    const name = (args.name as string).trim()

    const client = await this.sdk.connectRpc()

    const response = await client.removeAccount({ name, confirm })

    if (response.content.needsConfirm) {
      const value = (await CliUx.ux.prompt(`Are you sure? Type ${name} to confirm`)) as string

      if (value !== name) {
        this.log(`Aborting: ${value} did not match ${name}`)
        this.exit(1)
      }

      await client.removeAccount({ name, confirm: true })
    }

    this.log(`Account '${name}' successfully removed.`)
  }
}
