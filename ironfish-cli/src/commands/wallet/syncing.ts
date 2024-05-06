/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { GENESIS_BLOCK_SEQUENCE } from '@ironfish/sdk'
import { parseBoolean, parseNumber } from '../../args'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class SyncingCommand extends IronfishCommand {
  static description = `Enable or disable syncing for an account`

  static flags = {
    ...RemoteFlags,
  }

  static args = [
    {
      name: 'account',
      required: true,
      description: 'The sequence to start at (inclusive, genesis block is 1)',
    },
    {
      name: 'enabled',
      parse: (input: string): Promise<boolean | null> => Promise.resolve(parseBoolean(input)),
      required: false,
      description: 'The sequence to end at (inclusive)',
    },
  ]

  async start(): Promise<void> {
    const { args } = await this.parse(SyncingCommand)
    const account = args.account as string | undefined
    const enabled = args.enabled as boolean | null | undefined

    if (account == null) {
      this.error(`Must pass a valid account name.`)
    }

    if (enabled == null) {
      this.error(`Must pass either true or false.`)
    }

    const client = await this.sdk.connectRpc()

    if (enabled) {
      await client.wallet.startSyncing({
        account: account,
      })
      this.log(`Started syncing for account ${account}.`)
    } else {
      await client.wallet.stopSyncing({
        account: account,
      })
      this.log(`Stopped syncing for account ${account}.`)
    }
  }
}
