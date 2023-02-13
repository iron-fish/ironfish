/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import {
  ApiMultiAssetUpload,
  BufferUtils,
  GENESIS_BLOCK_SEQUENCE,
  GetTransactionStreamResponse,
  Meter,
  MultiAssetTypes,
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

export default class SyncMultiAsset extends IronfishCommand {
  static aliases = ['service:syncMultiAsset']
  static hidden = true

  static description = 'Upload Multi Asset events to an HTTP API using IronfishApi'

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
    const { flags } = await this.parse(SyncMultiAsset)

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
    const head = await api.headMultiAsset()

    let lastCountedSequence: number
    if (head) {
      const block = await client.getBlock({ hash: head })
      lastCountedSequence = block.content.block.sequence
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
      const serialized = buffer.map(serializeMultiAssets)
      buffer.length = 0
      await api.uploadMultiAsset(serialized)
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
      const headHash = (await api.headMultiAsset()) || ''

      const choices: MultiAssetTypes[] = [
        'MULTI_ASSET_TRANSFER',
        'MULTI_ASSET_BURN',
        'MULTI_ASSET_TRANSFER',
      ]
      const choice = choices[Math.floor(Math.random() * choices.length)]
      const connectedblockHash = uuid()
      await api.uploadMultiAsset([
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
              multiAssets: [{ type: choice, assetName: 'jowparks' }],
            },
          ],
        },
      ])
      await PromiseUtils.sleep(5000)
      if (Math.floor(Math.random() * 2) === 0) {
        // randomly disconnect blocks
        await api.uploadMultiAsset([
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

function serializeMultiAssets(data: GetTransactionStreamResponse): ApiMultiAssetUpload {
  const txs = []
  // should not send transactions if block is disconnected
  if (data.type === 'connected') {
    for (const tx of data.transactions) {
      const multiAssets = []
      for (const mint of tx.mints) {
        multiAssets.push({
          type: 'MULTI_ASSET_MINT' as MultiAssetTypes,
          assetName: BufferUtils.toHuman(Buffer.from(mint.assetName, 'hex')),
        })
      }
      for (const burn of tx.burns) {
        multiAssets.push({
          type: 'MULTI_ASSET_BURN' as MultiAssetTypes,
          assetName: BufferUtils.toHuman(Buffer.from(burn.assetName, 'hex')),
        })
      }
      for (const note of tx.notes) {
        // standard notes should not be included
        if (note.assetId !== Asset.nativeId().toString('hex')) {
          multiAssets.push({
            type: 'MULTI_ASSET_TRANSFER' as MultiAssetTypes,
            assetName: BufferUtils.toHuman(Buffer.from(note.assetName, 'hex')),
          })
        }
      }

      txs.push({
        ...tx,
        multiAssets: multiAssets,
      })
    }
  }
  return {
    ...data,
    transactions: txs,
  }
}
