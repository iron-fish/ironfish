/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ConfigOptions } from '@ironfish/sdk'
import { IronfishCommand } from '../command'
import { RemoteFlags } from '../flags'

const DEFAULT_NUM_OF_BLOCKS = 10

export class FeeCommand extends IronfishCommand {
  static description = `Get fee distribution for most recent blocks`

  static flags = {
    ...RemoteFlags,
  }

  async start(): Promise<void> {
    const client = await this.sdk.connectRpc()

    try {
      const response = await client.estimateFeeRates({})

      const config = await client.getConfig({})

      const configKey = 'feeEstimatorMaxBlockHistory' as keyof Partial<ConfigOptions>
      const low =
        config.content['feeEstimatorPercentileLow' as keyof Partial<ConfigOptions>] || '10'
      const medium =
        config.content['feeEstimatorPercentileMedium' as keyof Partial<ConfigOptions>] || '20'
      const high =
        config.content['feeEstimatorPercentileHigh' as keyof Partial<ConfigOptions>] || '30'
      const numOfBlocks = config.content[configKey] || DEFAULT_NUM_OF_BLOCKS

      this.log(
        `Fee distribution for last ${JSON.stringify(numOfBlocks)} block\n` +
          `percentile ${JSON.stringify(low)}: ${response.content.low || ''} ORE/kb\n` +
          `percentile ${JSON.stringify(medium)}: ${response.content.medium || ''} ORE/kb\n` +
          `percentile ${JSON.stringify(high)}: ${response.content.high || ''} ORE/kb\n`,
      )
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.error(error.message)
      }

      this.exit(1)
    }
  }
}
