/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { hasUserResponseError } from '../../utils'

export class RescanCommand extends IronfishCommand {
  static description = `Rescan the blockchain for transaction`

  static flags = {
    ...RemoteFlags,
    follow: Flags.boolean({
      char: 'f',
      default: true,
      description: 'follow the rescan live, or attach to an already running rescan',
      allowNo: true,
    }),
    reset: Flags.boolean({
      default: false,
      description:
        'clear the in-memory and disk caches before rescanning. note that this removes all pending transactions',
    }),
    local: Flags.boolean({
      default: false,
      description: 'Force the rescan to not connect via RPC',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(RescanCommand)
    const { follow, reset, local } = flags

    if (local && !follow) {
      this.error('You cannot pass both --local and --no-follow')
    }

    const client = await this.sdk.connectRpc(local)

    CliUx.ux.action.start('Rescanning Transactions', 'Asking node to start scanning', {
      stdout: true,
    })

    const response = client.rescanAccountStream({ reset, follow })

    try {
      for await (const { sequence, startedAt } of response.contentStream()) {
        CliUx.ux.action.status = `Scanning Block: ${sequence}, ${Math.floor(
          (Date.now() - startedAt) / 1000,
        )} seconds`
      }
    } catch (error) {
      if (hasUserResponseError(error)) {
        CliUx.ux.action.stop(error.codeMessage)
        return
      }

      throw error
    }

    CliUx.ux.action.stop(follow ? 'Scanning Complete' : 'Scan started in background')
  }
}
