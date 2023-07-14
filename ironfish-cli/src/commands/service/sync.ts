/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  FollowChainStream,
  Meter,
  RpcClient,
  TimeUtils,
  Transaction,
  WebApi,
} from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

const NEAR_SYNC_THRESHOLD = 5

export default class Sync extends IronfishCommand {
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
    maxUpload: Flags.integer({
      char: 'm',
      required: false,
      default: isNaN(Number(process.env.MAX_UPLOAD)) ? 20 : Number(process.env.MAX_UPLOAD),
      description: 'The max number of blocks or transactions to sync in one batch',
    }),
  }

  static args = [
    {
      name: 'head',
      required: false,
      description: 'The block hash to start following at',
    },
  ]

  async start(): Promise<void> {
    const { flags, args } = await this.parse(Sync)

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

    const head = args.head as string | null

    void this.syncTransactionGossip(client, api, flags.maxUpload)
    await this.syncBlocks(client, api, head, flags.maxUpload)
  }

  async syncBlocks(
    client: RpcClient,
    api: WebApi,
    head: string | null,
    maxUpload: number,
  ): Promise<void> {
    if (!head) {
      this.log(`Fetching head from ${api.host}`)
      head = await api.headBlocks()
    }

    if (head) {
      this.log(`Starting from head ${head}`)
    }

    const response = client.chain.followChainStream({
      head: head,
    })

    const speed = new Meter()
    speed.start()

    const buffer = new Array<FollowChainStream.Response>()

    async function commit(): Promise<void> {
      await api.blocks(buffer)
      buffer.length = 0
    }

    for await (const content of response.contentStream()) {
      buffer.push(content)
      speed.add(1)

      // We're almost done syncing if we are within 5 sequence to the HEAD
      const finishing =
        Math.abs(content.head.sequence - content.block.sequence) < NEAR_SYNC_THRESHOLD

      // Should we commit the current batch?
      const committing = buffer.length === maxUpload || finishing

      this.log(
        `${content.type}: ${content.block.hash} - ${content.block.sequence}${
          committing
            ? ' - ' +
              TimeUtils.renderEstimate(
                content.block.sequence,
                content.head.sequence,
                speed.rate5m,
              )
            : ''
        }`,
      )

      if (committing) {
        await commit()
      }
    }

    await commit()
  }

  async syncTransactionGossip(
    client: RpcClient,
    api: WebApi,
    maxUpload: number,
  ): Promise<void> {
    const response = client.event.onTransactionGossipStream({})

    const buffer = new Array<Transaction>()

    async function commit(): Promise<void> {
      await api.transactions(buffer)
      buffer.length = 0
    }

    for await (const content of response.contentStream()) {
      buffer.push(new Transaction(Buffer.from(content.serializedTransaction, 'hex')))

      if (buffer.length === maxUpload) {
        await commit()
      }
    }

    await commit()
  }
}
