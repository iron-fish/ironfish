/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import {
  ApiMaspUpload,
  GENESIS_BLOCK_SEQUENCE,
  GetTransactionStreamResponse,
  MaspTransactionTypes,
  Meter,
  PromiseUtils,
  TimeUtils,
  WebApi,
} from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { v4 as uuid } from 'uuid'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

const RAW_MAX_UPLOAD = Number(process.env.MAX_UPLOAD)
const MAX_UPLOAD = isNaN(RAW_MAX_UPLOAD) ? 1000 : RAW_MAX_UPLOAD
const NEAR_SYNC_THRESHOLD = 5

export default class SyncMaspTransactions extends IronfishCommand {
  static hidden = true

  static description = 'Upload MASP transactions to an HTTP API using IronfishApi'

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
    mock: Flags.boolean({
      allowNo: true,
      default: false,
      description: 'Send fake data to the API',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(SyncMaspTransactions)

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

    const api = new WebApi({ host: apiHost, token: apiToken })

    if (flags.mock) {
      await this.syncRandom(api)
    } else {
      await this.syncChain(api, flags.viewKey)
    }
  }

  async syncChain(api: WebApi, viewKey: string): Promise<void> {
    this.log('Watching with view key: ', viewKey)

    this.log('Connecting to node...')
    const client = await this.sdk.connectRpc()

    this.log(`Fetching head from ${api.host}`)
    const head = await api.headMaspTransactions()

    let lastCountedSequence: number
    if (head) {
      const blockInfo = await client.getBlockInfo({ hash: head })
      lastCountedSequence = blockInfo.content.block.sequence
    } else {
      lastCountedSequence = GENESIS_BLOCK_SEQUENCE
    }

    this.log(`Starting from block ${lastCountedSequence}: ${head || 'Genesis Block'}`)

    const response = this.sdk.client.getTransactionStream({
      incomingViewKey: viewKey,
      head: head,
    })

    const speed = new Meter()
    speed.start()

    const buffer = new Array<GetTransactionStreamResponse>()

    async function commit(): Promise<void> {
      const serialized = buffer.map(serializeMasp)
      buffer.length = 0
      await api.uploadMaspTransactions(serialized)
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

  async syncRandom(api: WebApi): Promise<void> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const headHash = (await api.headMaspTransactions()) || ''

      const choices: MaspTransactionTypes[] = ['MASP_MINT', 'MASP_BURN', 'MASP_TRANSFER']
      const choice = choices[Math.floor(Math.random() * choices.length)]
      const connectedblockHash = uuid()
      await api.uploadMaspTransactions([
        {
          type: 'connected',
          block: {
            hash: connectedblockHash,
            previousBlockHash: headHash,
            timestamp: new Date().getTime(),
            sequence: 1,
          },
          transactions: [
            {
              hash: uuid(),
              masps: [{ type: choice, assetName: 'jowparks' }],
            },
          ],
        },
      ])
      await PromiseUtils.sleep(5000)
      if (Math.floor(Math.random() * 2) === 0) {
        // randomly disconnect blocks
        await api.uploadMaspTransactions([
          {
            type: 'disconnected',
            block: {
              hash: connectedblockHash,
              previousBlockHash: headHash,
              timestamp: new Date().getTime(),
              sequence: 1,
            },
            transactions: [],
          },
        ])
      }
      await PromiseUtils.sleep(10000)
    }
  }
}

function serializeMasp(data: GetTransactionStreamResponse): ApiMaspUpload {
  const txs = data.transactions
  return {
    ...data,
    transactions: txs.map((tx) => {
      const masps = tx.mints
        .map((mint) => ({
          type: 'MASP_MINT' as MaspTransactionTypes,
          assetName: mint.assetName,
        }))
        .concat(
          tx.burns.map((burn) => ({
            type: 'MASP_BURN' as MaspTransactionTypes,
            assetName: burn.assetName,
          })),
        )
        .concat(
          tx.notes
            .filter((note) => note.assetId !== Asset.nativeIdentifier().toString())
            .map((transfer) => ({
              type: 'MASP_BURN' as MaspTransactionTypes,
              assetName: transfer.assetName,
            })),
        )
      return {
        ...tx,
        hash: tx.hash,
        masps: masps,
      }
    }),
  }
}
