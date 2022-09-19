/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PromiseUtils, TARGET_BLOCK_TIME_IN_SECONDS } from '@ironfish/sdk'
import { RpcBlockHeader, WebApi } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { IronfishCliPKG } from '../../package'

const STALE_THRESHOLD = TARGET_BLOCK_TIME_IN_SECONDS * 3 * 1000

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
      char: 'd',
      required: false,
      default: 1000,
      description: 'Delay (in ms) to wait before recalculating fork count',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(Forks)

    const delay = flags.delay
    const apiHost = (
      flags.endpoint ||
      process.env.IRONFISH_API_HOST ||
      'https://api.ironfish.network'
    ).trim()
    const apiToken = (flags.token || process.env.IRONFISH_API_TOKEN || '').trim()

    const api = new WebApi({ host: apiHost, token: apiToken })

    let connected = false
    const forks = new Map<
      string,
      { header: RpcBlockHeader; time: number; mined: number; old?: boolean }
    >()

    setInterval(() => {
      const now = Date.now()

      const values = [...forks.values()].sort((a, b) => b.header.sequence - a.header.sequence)
      let count = 0

      for (const { time, old } of values) {
        const age = now - time
        if (age >= STALE_THRESHOLD) {
          continue
        }
        if (old) {
          continue
        }
        count++
      }

      void api.submitTelemetry([
        {
          measurement: 'forks_count',
          timestamp: new Date(),
          fields: [
            {
              name: 'forks',
              type: 'integer',
              value: count,
            },
          ],
          tags: [{ name: 'version', value: IronfishCliPKG.version }],
        },
      ])
    }, delay)

    function handleGossip(header: RpcBlockHeader) {
      const prev = forks.get(header.previousBlockHash)
      const mined = prev ? prev.mined + 1 : 0

      if (prev) {
        prev.old = true
        forks.set(header.previousBlockHash, prev)
      }

      forks.set(header.hash, { header: header, time: Date.now(), mined: mined })
    }

    // eslint-disable-next-line no-constant-condition
    while (true) {
      connected = await this.sdk.client.tryConnect()

      if (!connected) {
        await PromiseUtils.sleep(1000)
        continue
      }

      const response = this.sdk.client.onGossipStream()

      for await (const value of response.contentStream()) {
        handleGossip(value.blockHeader)
      }
    }
  }
}
