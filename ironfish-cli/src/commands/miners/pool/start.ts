/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { MiningPool, StringUtils } from 'ironfish'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'

export class StartPool extends IronfishCommand {
  static description = `Start a mining pool that connects to a node`

  static flags = {
    ...RemoteFlags,
  }

  pool: MiningPool | null = null

  async start(): Promise<void> {
    const poolName = this.sdk.config.get('poolName') as string
    const nameByteLen = StringUtils.getByteLength(poolName)
    if (nameByteLen > 18) {
      this.warn(`The provided name ${poolName} has a byte length of ${nameByteLen}`)
      this.warn(
        'It is recommended to keep the pool name below 18 bytes in length to avoid possible work duplication issues',
      )
    }

    const rpc = this.sdk.client

    this.log(`Starting pool with name ${poolName}`)

    this.pool = await MiningPool.init({
      config: this.sdk.config,
      rpc,
    })
    await this.pool.start()
    await this.pool.waitForStop()
  }

  async closeFromSignal(): Promise<void> {
    await this.pool?.stop()
  }
}
