/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { MaspTransactionTypes, PromiseUtils, WebApi } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { v4 as uuid } from 'uuid'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export default class SyncMaspTransactions extends IronfishCommand {
  static aliases = ['service:syncMaspTransactions']
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
  }

  static args = [
    {
      name: 'head',
      required: false,
      description: 'The block hash to start following at',
    },
  ]

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

    this.log('Watching with view key: ', flags.viewKey)
    this.log('Connecting to node...')

    const api = new WebApi({ host: apiHost, token: apiToken })

    const sendRandom = async () => {
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
              type: choice,
              assetName: 'jowparks',
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
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await sendRandom()
    }
  }
}
