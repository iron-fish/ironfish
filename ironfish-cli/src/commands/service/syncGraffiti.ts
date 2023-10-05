/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { FollowChainStreamResponse, RpcClient, WebApi } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export default class SyncGraffiti extends IronfishCommand {
  static hidden = true

  static description = `
    Upload blocks and mempool transactions to an HTTP API using IronfishApi
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
    head: Flags.string({
      char: 's',
      required: false,
      description: 'The block hash to start updating from',
    }),
    stopSequence: Flags.integer({
      char: 's',
      required: true,
      description: 'Block sequence up to which to sync',
    }),
    maxUpload: Flags.integer({
      char: 'm',
      required: false,
      default: isNaN(Number(process.env.MAX_UPLOAD)) ? 200 : Number(process.env.MAX_UPLOAD),
      description: 'The max number of blocks or transactions to sync in one batch',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(SyncGraffiti)

    const apiHost = (flags.endpoint || process.env.IRONFISH_API_HOST || '').trim()
    const apiToken = (flags.token || process.env.IRONFISH_API_TOKEN || '').trim()

    if (!apiHost) {
      this.log(
        `No api host found to upload blocks and transactions to. You must set IRONFISH_API_HOST env variable or pass --endpoint flag.`,
      )
      this.exit(1)
    }

    if (!apiToken) {
      this.log(
        `No api token found to auth with the API. You must set IRONFISH_API_TOKEN env variable or pass --token flag.`,
      )
      this.exit(1)
    }

    this.log('Connecting to node...')

    const client = await this.sdk.connectRpc()

    const api = new WebApi({ host: apiHost, token: apiToken })

    await this.syncBlockGraffiti(client, api, flags.stopSequence, flags.maxUpload, flags.head)
  }

  async syncBlockGraffiti(
    client: RpcClient,
    api: WebApi,
    stopSequence: number,
    maxUpload: number,
    head: string | undefined,
  ): Promise<void> {
    this.log(`Starting from head ${head ? head : 'undefined'}`)

    const response = client.chain.followChainStream(head ? { head } : undefined)
    const buffer = new Array<FollowChainStreamResponse>()

    this.log('Syncing graffiti...')

    async function commit(): Promise<void> {
      await api.batchUpdateBlockGraffiti(buffer)
      buffer.length = 0
    }

    for await (const content of response.contentStream()) {
      // We're done syncing if we greater than the stop sequence entered

      const block = content.block

      buffer.push(content)

      if (block.sequence >= stopSequence) {
        break
      }

      const committing = buffer.length === maxUpload

      if (committing) {
        this.log(`updating: ${buffer.length}`)

        await commit()
      }
    }

    this.log(`final update: ${buffer.length}`)
    await commit()
  }
}
