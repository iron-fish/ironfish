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
      char: 'd',
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

      const response = await this.sdk.client.estimateFeeRates()

      if (!(response.content.low && response.content.medium && response.content.high)) {
        this.log('Unexpected response')
      } else {
        const feeRateLow = Number(CurrencyUtils.decode(response.content.low))
        const feeRateMedium = Number(CurrencyUtils.decode(response.content.medium))
        const feeRateHigh = Number(CurrencyUtils.decode(response.content.high))

        await api.submitTelemetry({
          points: [
            {
              measurement: 'fee_rate_estimate',
              timestamp: new Date(),
              fields: [
                {
                  name: `fee_rate_low`,
                  type: 'integer',
                  value: feeRateLow,
                },
                {
                  name: `fee_rate_medium`,
                  type: 'integer',
                  value: feeRateMedium,
                },
                {
                  name: `fee_rate_high`,
                  type: 'integer',
                  value: feeRateHigh,
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
