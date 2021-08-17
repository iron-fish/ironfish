/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { flags } from '@oclif/command'
import cli from 'cli-ux'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { hasUserResponseError } from '../../utils'

export class RescanCommand extends IronfishCommand {
  static description = `Rescan the blockchain for transaction`

  static flags = {
    ...RemoteFlags,
    detach: flags.boolean({
      default: false,
      description: 'if a scan is already happening, follow that scan instead',
    }),
    reset: flags.boolean({
      default: false,
      description:
        'clear the in-memory and disk caches before rescanning. note that this removes all pending transactions',
    }),
    local: flags.boolean({
      default: false,
      description: 'Force the rescan to not connect via RPC',
    }),
  }

  async start(): Promise<void> {
    const { flags } = this.parse(RescanCommand)
    const { detach, reset, local } = flags
    const client = await this.sdk.connectRpc(local)

    cli.action.start('Rescanning Transactions', 'Asking node to start scanning', {
      stdout: true,
    })

    const response = client.rescanAccountStream({ reset, follow: !detach })

    try {
      for await (const { sequence, startedAt } of response.contentStream()) {
        cli.action.status = `Scanning Block: ${sequence}, ${Math.floor(
          (Date.now() - startedAt) / 1000,
        )} seconds`
      }
    } catch (error) {
      if (hasUserResponseError(error)) {
        cli.action.stop(error.codeMessage)
        return
      }

      throw error
    }

    cli.action.stop(detach ? 'Scan started in background' : 'Scanning Complete')
  }
}
