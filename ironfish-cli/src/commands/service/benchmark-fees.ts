/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BenchUtils, TimeUtils } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'

export default class BenchmarkFees extends IronfishCommand {
  static aliases = ['service:benchmark-fees']

  static description = 'Test the performance of fee estimation endpoints'

  static hidden = true

  static flags = {
    ...LocalFlags,
    repetitions: Flags.integer({
      char: 'r',
      required: false,
      default: 3,
      description: 'Number of times to repeat benchmarking',
    }),
    blocks: Flags.integer({
      char: 'b',
      required: false,
      default: 100,
      description: 'Number of blocks to use in getFees requests',
    }),
  }

  static args = []

  async start(): Promise<void> {
    const { flags } = await this.parse(BenchmarkFees)
    const { repetitions, blocks } = flags

    CliUx.ux.action.start('Connecting to node')
    const client = await this.sdk.connectRpc()
    CliUx.ux.action.stop()

    const accountName = 'default'

    const publicKeyResponse = await client.getAccountPublicKey({ account: accountName })
    const address = publicKeyResponse.content.publicKey

    const receives = [{ publicAddress: address, amount: '1000', memo: 'benchmark' }]

    const resultTimes = {
      getFees: new Array<number>(),
      estimateFeeRates: new Array<number>(),
      estimateFee: new Array<number>(),
    }

    let getFeesErrorCount = 0

    CliUx.ux.action.start('Benchmarking fees RPC endpoints')
    for (let i = 0; i < repetitions; i++) {
      const getFeesSegment = BenchUtils.startSegment()

      try {
        await client.getFees({ numOfBlocks: blocks })
      } catch (e) {
        getFeesErrorCount++
      }

      const getFeesResults = BenchUtils.endSegment(getFeesSegment)
      resultTimes.getFees.push(getFeesResults.time)

      const estimateFeeRatesSegment = BenchUtils.startSegment()

      await client.estimateFeeRates({})

      const estimateFeeRatesResults = BenchUtils.endSegment(estimateFeeRatesSegment)
      resultTimes.estimateFeeRates.push(estimateFeeRatesResults.time)

      const estimateFeeSegment = BenchUtils.startSegment()

      await client.estimateFee({
        fromAccountName: accountName,
        receives,
      })

      const estimateFeeResults = BenchUtils.endSegment(estimateFeeSegment)
      resultTimes.estimateFee.push(estimateFeeResults.time)
    }
    CliUx.ux.action.stop()

    const results = [
      { route: 'getFees', time: TimeUtils.renderSpan(average(resultTimes.getFees)) },
      {
        route: 'estimateFeeRates',
        time: TimeUtils.renderSpan(average(resultTimes.estimateFeeRates)),
      },
      { route: 'estimateFee', time: TimeUtils.renderSpan(average(resultTimes.estimateFee)) },
    ]

    CliUx.ux.table(results, { route: {}, time: { header: 'Average Time' } })

    this.log(
      `\nNOTE: ${repetitions} requests to getFees resulted in ${getFeesErrorCount} errors`,
    )
  }
}

function average(arr: number[]): number {
  return arr.reduce((a, b) => a + b) / arr.length
}
