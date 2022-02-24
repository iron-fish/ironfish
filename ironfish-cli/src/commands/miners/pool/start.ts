/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CliUx, Flags } from '@oclif/core'
import {
  AsyncUtils,
  FileUtils,
  Miner as IronfishMiner,
  MineRequest,
  MiningPool,
  NewBlocksStreamResponse,
  PromiseUtils,
} from 'ironfish'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'

export class StartPool extends IronfishCommand {
  static description = `Start a mining pool that connects to a node`

  static flags = {
    ...RemoteFlags,
  }

  pool: MiningPool | null = null

  async start(): Promise<void> {
    await this.parse(StartPool)

    const rpc = this.sdk.client

    this.pool = new MiningPool({ rpc })
    await this.pool.start()
    await this.pool.waitForStop()
  }

  async closeFromSignal(): Promise<void> {
    this.pool?.stop()
    await Promise.resolve()
  }
}
