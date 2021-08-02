/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { flags } from '@oclif/command'
import { Meter, TimeUtils } from 'ironfish'
import { IronfishApi } from '../../api'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export default class Sync extends IronfishCommand {
  static hidden = true

  static description = `
    Upload blocks to an HTTP API

    The API should be compatible with the Ironfish API here:
    https://github.com/iron-fish/ironfish-api/blob/master/src/blocks/blocks.controller.ts
  `

  static flags = {
    ...RemoteFlags,
    endpoint: flags.string({
      char: 'e',
      parse: (input: string): string => input.trim(),
      required: false,
      description: 'API host to sync to',
    }),
    token: flags.string({
      char: 'e',
      parse: (input: string): string => input.trim(),
      required: false,
      description: 'API host token to authenticate with',
    }),
  }

  static args = [
    {
      name: 'head',
      required: false,
      description: 'the block hash to start following at',
    },
  ]

  async start(): Promise<void> {
    const { flags, args } = this.parse(Sync)

    const apiHost = (flags.endpoint || process.env.IRONFISH_API_HOST || '').trim()
    const apiToken = (flags.token || process.env.IRONFISH_API_TOKEN || '').trim()

    if (!apiHost) {
      this.log(
        `No api host found to upload blocks too. You must set IRONFISH_API_HOST env variable or pass --endpoint flag.`,
      )
      this.exit(1)
    }

    if (!apiToken) {
      this.log(
        `No api token found to auth with the API. You must set IRONFISH_API_TOKEN env variable or pass --token flag.`,
      )
      this.exit(1)
    }

    this.log('Connecting to node and fetching head...')

    const client = await this.sdk.connectRpc()

    const api = new IronfishApi(apiHost, apiToken)
    const head = await api.head()

    const response = client.followChainStream({
      head: (args.head || head) as string | null,
    })

    const speed = new Meter()
    speed.start()

    for await (const content of response.contentStream()) {
      speed.add(1)

      const estimate = TimeUtils.renderEstimate(
        content.block.sequence,
        content.head.sequence,
        speed.rate5s,
      )

      this.log(
        `${content.type}: ${content.block.hash} - ${content.block.sequence} - ${estimate}`,
      )

      await api.blocks(content)
    }
  }
}
