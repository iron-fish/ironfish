/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { setLogLevelFromConfig } from '@ironfish/sdk'
import { Flags, ux } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { checkWalletUnlocked, ProgressBar, ProgressBarPresets } from '../../ui'
import { hasUserResponseError } from '../../utils'

export class RescanCommand extends IronfishCommand {
  static description = `resets all accounts balance and rescans`

  static flags = {
    ...RemoteFlags,
    follow: Flags.boolean({
      char: 'f',
      default: true,
      description: 'Follow the rescan live, or attach to an already running rescan',
      allowNo: true,
    }),
    local: Flags.boolean({
      default: false,
      description: 'Force the rescan to not connect via RPC',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(RescanCommand)
    const { follow, local } = flags

    if (local && !follow) {
      this.error('You cannot pass both --local and --no-follow')
    }

    const client = await this.connectRpc(local)
    await checkWalletUnlocked(client)

    ux.action.start('Asking node to start scanning', undefined, {
      stdout: true,
    })

    // Suppress log messages from the wallet scanner, to prevent those messages
    // from interfering with the progress bar. This problem can occur only if
    // not connected to a remote node (i.e. we're running with the in-memory
    // rpc).
    setLogLevelFromConfig('wallet:error')

    const response = client.wallet.rescan({ follow })

    const progress = new ProgressBar('Scanning blocks', {
      preset: ProgressBarPresets.withSpeed,
    })

    let started = false
    try {
      for await (const { endSequence, sequence } of response.contentStream()) {
        if (!started) {
          ux.action.stop()
          progress.start(endSequence, 0)
          started = true
        }

        progress.update(sequence)
      }
    } catch (error) {
      progress?.stop()

      if (hasUserResponseError(error)) {
        this.error(error.codeMessage)
      }

      throw error
    }

    progress?.stop()
    this.log(follow ? 'Scanning Complete' : 'Scan started in background')
  }
}
