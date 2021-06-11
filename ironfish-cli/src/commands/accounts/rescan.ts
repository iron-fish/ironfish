/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import cli from 'cli-ux'
import { IronfishSdk, runRescan } from 'ironfish'
import { flags } from '@oclif/command'
import { hasUserResponseError } from '../../utils'

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
    offline: flags.boolean({
      default: false,
      description: 'Rescan the blockchain without an online node',
    }),
  }

  async start(): Promise<void> {
    const { flags } = this.parse(RescanCommand)
    const { follow, reset, offline } = flags

    await rescan(this.sdk, follow, reset, offline)
  }
}

export async function rescan(
  sdk: IronfishSdk,
  follow: boolean,
  reset: boolean,
  offline: boolean,
): Promise<void> {
  cli.action.start('Rescanning Transactions', 'Asking node to start scanning', {
    stdout: true,
  })

  try {
    const updateCliStatus = (startedAt: number) => ({
      sequence,
    }: {
      sequence: number
    }): void => {
      cli.action.status = `Scanning Block: ${sequence}, ${Math.floor(
        (Date.now() - startedAt) / 1000,
      )} seconds`
    }
    const updateCliStatusWithStartTime = updateCliStatus(Date.now())

    if (offline) {
      const node = await sdk.node()
      await node.openDB()
      await node.chain.open()

      await runRescan(node, follow, reset, updateCliStatusWithStartTime)
    } else {
      await sdk.client.connect()
      const response = sdk.client.rescanAccountStream({ follow, reset })

      for await (const { sequence } of response.contentStream()) {
        updateCliStatusWithStartTime({ sequence })
      }
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
