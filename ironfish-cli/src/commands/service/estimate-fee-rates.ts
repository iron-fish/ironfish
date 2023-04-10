/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CurrencyUtils, PromiseUtils } from '@ironfish/sdk'
import { WebApi } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { IronfishCliPKG } from '../../package'

export default class EstimateFees extends IronfishCommand {
  static hidden = true

  static description = `
     Measures fee rate estimates and submits them to telemetry API
   `

  static flags = {
    ...RemoteFlags,
    endpoint: Flags.string({
      char: 'e',
      parse: (input: string) => Promise.resolve(input.trim()),
      required: false,
      description: 'API host to sync to',
    }),
    token: Flags.string({
      char: 't',
      parse: (input: string) => Promise.resolve(input.trim()),
      required: false,
      description: 'API host token to authenticate with',
    }),
    delay: Flags.integer({
      required: false,
      default: 60000,
      description: 'Delay (in ms) to wait before uploading fee rate estimates',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(EstimateFees)

    const apiHost = (
      flags.endpoint ||
      process.env.IRONFISH_API_HOST ||
      'https://api.ironfish.network'
    ).trim()

    const apiToken = (flags.token || process.env.IRONFISH_API_TOKEN || '').trim()

    const api = new WebApi({ host: apiHost, token: apiToken })

    let connected = false

    // eslint-disable-next-line no-constant-condition
    while (true) {
      connected = await this.sdk.client.tryConnect()

      if (!connected) {
        await PromiseUtils.sleep(1000)
        continue
      }

      const response = await this.sdk.client.chain.estimateFeeRates()

      if (!(response.content.slow && response.content.average && response.content.fast)) {
        this.log('Unexpected response')
      } else {
        const feeRateSlow = Number(CurrencyUtils.decode(response.content.slow))
        const feeRateAverage = Number(CurrencyUtils.decode(response.content.average))
        const feeRateFast = Number(CurrencyUtils.decode(response.content.fast))

        await api.submitTelemetry({
          points: [
            {
              measurement: 'fee_rate_estimate',
              timestamp: new Date(),
              fields: [
                {
                  name: `fee_rate_slow`,
                  type: 'integer',
                  value: feeRateSlow,
                },
                {
                  name: `fee_rate_average`,
                  type: 'integer',
                  value: feeRateAverage,
                },
                {
                  name: `fee_rate_fast`,
                  type: 'integer',
                  value: feeRateFast,
                },
              ],
              tags: [{ name: 'version', value: IronfishCliPKG.version }],
            },
          ],
        })
      }

      await PromiseUtils.sleep(flags.delay)
    }
  }
}
