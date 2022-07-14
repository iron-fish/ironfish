/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Meter, TimeUtils } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { ProgressBar } from '../../types'
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

    CliUx.ux.action.start('Asking node to start scanning', undefined, {
      stdout: true,
    })

    const response = client.rescanAccountStream({ reset, follow })

    const speed = new Meter()

    const progress = CliUx.ux.progress({
      format: 'Scanning Blocks: [{bar}] {value}/{total} {percentage}% {speed}/sec | {estimate}',
    }) as ProgressBar

    let started = false
    let lastSequence = 0

    try {
      for await (const { endSequence, sequence } of response.contentStream()) {
        if (!started) {
          CliUx.ux.action.stop()
          speed.start()
          progress.start(endSequence, 0)
          started = true
        }

        const completed = sequence - lastSequence
        lastSequence = sequence

        speed.add(completed)
        progress.increment(completed)

        progress.update({
          estimate: TimeUtils.renderEstimate(sequence, endSequence, speed.rate1m),
          speed: speed.rate1s.toFixed(0),
        })
      }
    } catch (error) {
      progress?.stop()
      speed.stop()

      if (hasUserResponseError(error)) {
        this.error(error.codeMessage)
      }

      throw error
    }

    speed.stop()
    progress?.stop()
    this.log(follow ? 'Scanning Complete' : 'Scan started in background')
  }
}
