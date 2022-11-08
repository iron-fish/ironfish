/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IronfishCommand } from '../command'
import { RemoteFlags } from '../flags'

export class FeeCommand extends IronfishCommand {
  static description = `Get fee distribution for most recent blocks`

  static flags = {
    ...RemoteFlags,
  }

  async start(): Promise<void> {
    const client = await this.sdk.connectRpc()

    const response = await client.estimateFeeRates()
    const config = await client.getConfig()

    const low = config.content['feeEstimatorPercentileLow'] || '10'
    const medium = config.content['feeEstimatorPercentileMedium'] || '20'
    const high = config.content['feeEstimatorPercentileHigh'] || '30'
    const numOfBlocks = config.content['feeEstimatorMaxBlockHistory']

    this.log(
      `Fee distribution for last ${JSON.stringify(numOfBlocks)} block\n` +
        `percentile ${JSON.stringify(low)}: ${response.content.low || ''} ORE/kb\n` +
        `percentile ${JSON.stringify(medium)}: ${response.content.medium || ''} ORE/kb\n` +
        `percentile ${JSON.stringify(high)}: ${response.content.high || ''} ORE/kb`,
    )
  }
}
