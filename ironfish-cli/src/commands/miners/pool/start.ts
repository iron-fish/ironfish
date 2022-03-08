/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Flags } from '@oclif/core'
import { MiningPool, StringUtils } from 'ironfish'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'

export class StartPool extends IronfishCommand {
  static description = `Start a mining pool that connects to a node`

  static flags = {
    ...RemoteFlags,
    poolName: Flags.string({
      char: 'n',
      default: 'Iron Fish Pool',
      description: 'a name to identify the pool in graffiti and payout memo',
    }),
  }

  pool: MiningPool | null = null

  async start(): Promise<void> {
    const { flags } = await this.parse(StartPool)

    const nameByteLen = StringUtils.getByteLength(flags.poolName)
    if (nameByteLen > 18) {
      this.warn(`The provided name ${flags.poolName} has a byte length of ${nameByteLen}`)
      this.warn(
        'It is recommended to keep the pool name below 18 bytes in length to avoid possible work duplication issues',
      )
    }

    const rpc = this.sdk.client

    this.log(`Starting pool with name ${flags.poolName}`)

    this.pool = await MiningPool.init({ name: flags.poolName, rpc })
    await this.pool.start()
    await this.pool.waitForStop()
  }

  async closeFromSignal(): Promise<void> {
    await this.pool?.stop()
  }
}
