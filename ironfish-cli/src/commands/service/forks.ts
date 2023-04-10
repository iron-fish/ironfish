/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PromiseUtils } from '@ironfish/sdk'
import { WebApi } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { IronfishCliPKG } from '../../package'
import { GossipForkCounter } from '../../utils/gossipForkCounter'

export default class Forks extends IronfishCommand {
  static hidden = true

  static description = `
     Detects forks being mined and submits count to telemetry API
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
      description: 'Delay (in ms) to wait before uploading fork count',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(Forks)

    const apiHost = (
      flags.endpoint ||
      process.env.IRONFISH_API_HOST ||
      'https://api.ironfish.network'
    ).trim()

    const apiToken = (flags.token || process.env.IRONFISH_API_TOKEN || '').trim()

    const api = new WebApi({ host: apiHost, token: apiToken })

    await this.sdk.client.connect()

    const targetBlockTimeInSeconds = (await this.sdk.client.chain.getConsensusParameters())
      .content.targetBlockTimeInSeconds

    const counter = new GossipForkCounter(targetBlockTimeInSeconds, { delayMs: flags.delay })
    counter.start()

    let connected = false

    setInterval(() => {
      void api.submitTelemetry({
        points: [
          {
            measurement: 'forks_count',
            timestamp: new Date(),
            fields: [
              {
                name: 'forks',
                type: 'integer',
                value: counter.count,
              },
            ],
            tags: [{ name: 'version', value: IronfishCliPKG.version }],
          },
        ],
      })
    }, flags.delay)

    // eslint-disable-next-line no-constant-condition
    while (true) {
      connected = await this.sdk.client.tryConnect()

      if (!connected) {
        await PromiseUtils.sleep(1000)
        continue
      }

      const response = this.sdk.client.event.onGossipStream()

      for await (const value of response.contentStream()) {
        counter.add(value.blockHeader)
      }
    }
  }
}
