/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { flags } from '@oclif/command'
import cli from 'cli-ux'
import { IronfishRpcClient } from 'ironfish'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { hasUserResponseError } from '../../utils'
import { getConnectedClient } from '../config/show'

export class RescanCommand extends IronfishCommand {
  static description = `Rescan the blockchain for transaction`

  static flags = {
    ...RemoteFlags,
    follow: flags.boolean({
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
      description: 'Rescan the blockchain without an online node',
    }),
  }

  async start(): Promise<void> {
    const { flags } = this.parse(RescanCommand)
    const { follow, reset, local } = flags
    const client = await getConnectedClient(this.sdk, local)

    await rescan(client, follow, reset)
  }
}

export async function rescan(
  client: IronfishRpcClient,
  follow: boolean,
  reset: boolean,
): Promise<void> {
  cli.action.start('Rescanning Transactions', 'Asking node to start scanning', {
    stdout: true,
  })

  const startedAt = Date.now()
  const response = client.rescanAccountStream({ follow, reset })

  try {
    for await (const { sequence } of response.contentStream()) {
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

  cli.action.stop('Scanning Complete')
}
