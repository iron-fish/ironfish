/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  DEFAULT_FEE_ESTIMATOR_MAX_BLOCK_HISTORY,
  DEFAULT_FEE_ESTIMATOR_PERCENTILE_AVERAGE,
  DEFAULT_FEE_ESTIMATOR_PERCENTILE_FAST,
  DEFAULT_FEE_ESTIMATOR_PERCENTILE_SLOW,
  RpcClient,
} from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../command'
import { RemoteFlags } from '../flags'

export class FeeCommand extends IronfishCommand {
  static description = 'show network transaction fees'

  static flags = {
    ...RemoteFlags,
    explain: Flags.boolean({
      default: false,
      description: 'Explain fee rates',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(FeeCommand)

    const client = await this.connectRpc()

    if (flags.explain) {
      await this.explainFeeRates(client)
    }

    const feeRates = await client.chain.estimateFeeRates()

    this.log('Fee Rates ($ORE/kB)')
    this.log(`slow:    ${feeRates.content.slow || ''}`)
    this.log(`average: ${feeRates.content.average || ''}`)
    this.log(`fast:    ${feeRates.content.fast || ''}`)
  }

  async explainFeeRates(client: RpcClient): Promise<void> {
    const config = await client.config.getConfig()

    const slow =
      config.content['feeEstimatorPercentileSlow'] || DEFAULT_FEE_ESTIMATOR_PERCENTILE_SLOW
    const average =
      config.content['feeEstimatorPercentileAverage'] ||
      DEFAULT_FEE_ESTIMATOR_PERCENTILE_AVERAGE
    const fast =
      config.content['feeEstimatorPercentileFast'] || DEFAULT_FEE_ESTIMATOR_PERCENTILE_FAST
    const numBlocks =
      config.content['feeEstimatorMaxBlockHistory'] || DEFAULT_FEE_ESTIMATOR_MAX_BLOCK_HISTORY

    this.log(
      `Fee rates are estimated from the distribution of transaction fees over the last ${numBlocks} blocks.\n`,
    )
    this.log(
      'The fee rate for each transaction is computed by dividing the transaction fee in $ORE by the size of the transaction in kB.\n',
    )
    this.log(
      'The slow, average, and fast rates each come from a percentile in the distribution:',
    )
    this.log(`slow:    ${slow}th`)
    this.log(`average: ${average}th`)
    this.log(`fast:    ${fast}th`)
    this.log('')
  }
}
