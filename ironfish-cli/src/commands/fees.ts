/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { RpcClient } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../command'
import { RemoteFlags } from '../flags'

export class FeeCommand extends IronfishCommand {
  static description = `Get fee distribution for most recent blocks`

  static flags = {
    ...RemoteFlags,
    explain: Flags.boolean({
      default: false,
      description: 'Explain fee rates',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(FeeCommand)

    const client = await this.sdk.connectRpc()

    if (flags.explain) {
      await this.explainFeeRates(client)
    }

    const feeRates = await client.estimateFeeRates()

    this.log('Fee Rates ($ORE/kB)')
    this.log(`slow:    ${feeRates.content.slow || ''}`)
    this.log(`average: ${feeRates.content.average || ''}`)
    this.log(`fast:   ${feeRates.content.fast || ''}`)
  }

  async explainFeeRates(client: RpcClient): Promise<void> {
    const config = await client.getConfig()

    const slow = config.content['feeEstimatorPercentileLow'] || '10'
    const average = config.content['feeEstimatorPercentileMedium'] || '20'
    const fast = config.content['feeEstimatorPercentileHigh'] || '30'
    const numBlocks = config.content['feeEstimatorMaxBlockHistory'] || '10'

    this.log(
      `Fee rates are estimated from the distribution of transaction fees over the last ${numBlocks} blocks.\n`,
    )
    this.log(
      'The fee rate for each transaction is computed by dividing the transaction fee in $ORE by the size of the transaction in kB.\n',
    )
    this.log('The low, medium, and high rates each come from a percentile in the distribution:')
    this.log(`slow:    ${slow}th`)
    this.log(`average: ${average}th`)
    this.log(`fast:   ${fast}th`)
    this.log('')
  }
}
