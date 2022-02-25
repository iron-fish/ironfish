/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CliUx, Flags } from '@oclif/core'
import {
  AsyncUtils,
  FileUtils,
  GraffitiUtils,
  Miner as IronfishMiner,
  MineRequest,
  MiningPoolMiner,
  NewBlocksStreamResponse,
  PromiseUtils,
} from 'ironfish'
import os from 'os'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class Miner extends IronfishCommand {
  static description = `Start a miner and subscribe to new blocks for the node`

  static flags = {
    ...RemoteFlags,
    threads: Flags.integer({
      char: 't',
      default: 1,
      description:
        'number of CPU threads to use for mining. -1 will auto-detect based on number of CPU cores.',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(Miner)

    if (flags.threads === 0 || flags.threads < -1) {
      throw new Error('--threads must be a positive integer or -1.')
    }

    if (flags.threads === -1) {
      flags.threads = os.cpus().length
    }

    const graffiti = this.sdk.config.get('blockGraffiti')
    this.log(`Staring to mine with graffiti: ${graffiti}`)

    const miner = MiningPoolMiner.init({
      threadCount: flags.threads,
      graffiti: GraffitiUtils.fromString(graffiti),
    })

    await miner.mine()
  }
}
