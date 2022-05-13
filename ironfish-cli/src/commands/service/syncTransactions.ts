/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  ApiDepositUpload,
  GetTransactionStreamResponse,
  MemoUtils,
  Meter,
  TimeUtils,
  WebApi,
} from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

const RAW_MAX_UPLOAD = Number(process.env.MAX_UPLOAD)
const MAX_UPLOAD = isNaN(RAW_MAX_UPLOAD) ? 500 : RAW_MAX_UPLOAD
const NEAR_SYNC_THRESHOLD = 5

export default class SyncTransactions extends IronfishCommand {
  static hidden = true

  static description = 'Upload transactions to an HTTP API using IronfishApi'

  static flags = {
    ...RemoteFlags,
    viewKey: Flags.string({
      char: 'k',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: true,
      description: 'View key to watch transactions with',
    }),
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
  }

  static args = [
    {
      name: 'head',
      required: false,
      description: 'the block hash to start following at',
    },
  ]

  async start(): Promise<void> {
    const { flags, args } = await this.parse(SyncTransactions)

    const apiHost = (flags.endpoint || process.env.IRONFISH_API_HOST || '').trim()
    const apiToken = (flags.token || process.env.IRONFISH_API_TOKEN || '').trim()

    if (!apiHost) {
      this.log(
        `No api host found to upload blocks to. You must set IRONFISH_API_HOST env variable or pass --endpoint flag.`,
      )
      this.exit(1)
    }

    if (!apiToken) {
      this.log(
        `No api token found to auth with the API. You must set IRONFISH_API_TOKEN env variable or pass --token flag.`,
      )
      this.exit(1)
    }

    this.log('Watching with view key: ', flags.viewKey)
    this.log('Connecting to node...')

    const client = await this.sdk.connectRpc()

    const api = new WebApi({ host: apiHost, token: apiToken })

    let head = args.head as string | null
    if (!head) {
      this.log(`Fetching head from ${apiHost}`)
      head = await api.headDeposits()
      this.log(`Starting from ${head || 'Genesis Block'}`)
    }

    let lastCountedSequence = 0

    if (head) {
      this.log(`Starting from head ${head}`)
      const blockInfo = await client.getBlockInfo({ hash: head })
      lastCountedSequence = blockInfo.content.block.sequence
    }

    const response = this.sdk.client.getTransactionStream({
      incomingViewKey: flags.viewKey,
      head: head,
    })

    const speed = new Meter()
    speed.start()

    const buffer = new Array<GetTransactionStreamResponse>()

    async function commit(): Promise<void> {
      const serialized = buffer.map(serializeDeposit)
      buffer.length = 0
      await api.uploadDeposits(serialized)
    }

    for await (const content of response.contentStream()) {
      buffer.push(content)
      speed.add(content.block.sequence - lastCountedSequence)
      lastCountedSequence = content.block.sequence

      // We're almost done syncing if we are within NEAR_SYNC_THRESHOLD sequence to the HEAD
      const finishing =
        Math.abs(content.head.sequence - content.block.sequence) < NEAR_SYNC_THRESHOLD

      // Should we commit the current batch?
      let txLength = 0
      for (const block of buffer) {
        txLength += block.transactions.length
      }
      const committing = txLength >= MAX_UPLOAD || finishing

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
  }
}

function serializeDeposit(data: GetTransactionStreamResponse): ApiDepositUpload {
  return {
    ...data,
    transactions: data.transactions.map((tx) => ({
      ...tx,
      notes: tx.notes.map((note) => ({
        ...note,
        memo: MemoUtils.toHuman(note.memo),
        amount: Number(note.amount),
      })),
    })),
  }
}
