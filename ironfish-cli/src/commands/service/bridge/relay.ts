/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert, GetTransactionStreamResponse, Meter, TimeUtils, WebApi } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'

export default class BridgeRelay extends IronfishCommand {
  static hidden = true

  static description = `
    Relay Iron Fish deposits to the Sepolia bridge contract
  `

  static flags = {
    ...RemoteFlags,
    endpoint: Flags.string({
      char: 'e',
      description: 'API host to sync to',
      parse: (input: string) => Promise.resolve(input.trim()),
      env: 'IRONFISH_API_HOST',
    }),
    token: Flags.string({
      char: 't',
      description: 'API token to authenticate with',
      parse: (input: string) => Promise.resolve(input.trim()),
      env: 'IRONFISH_API_TOKEN',
    }),
    incomingViewKey: Flags.string({
      char: 'k',
      description: 'View key to watch transactions with',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: true,
    }),
    confirmations: Flags.integer({
      char: 'c',
      description: 'Minimum number of block confirmations needed to process deposits',
      required: false,
    }),
    fromHead: Flags.string({
      char: 'f',
      description: 'The block hash to start following at',
      required: false,
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(BridgeRelay)

    if (!flags.endpoint) {
      this.log(
        `No api host set. You must set IRONFISH_API_HOST env variable or pass --endpoint flag.`,
      )
      this.exit(1)
    }

    if (!flags.token) {
      this.log(
        `No api token set. You must set IRONFISH_API_TOKEN env variable or pass --token flag.`,
      )
      this.exit(1)
    }

    const api = new WebApi({ host: flags.endpoint, token: flags.token })

    const confirmations = flags.confirmations ?? this.sdk.config.get('confirmations')

    await this.syncBlocks(api, flags.incomingViewKey, confirmations, flags.fromHead)
  }

  async syncBlocks(
    api: WebApi,
    incomingViewKey: string,
    confirmations: number,
    head?: string,
  ): Promise<void> {
    this.log('Connecting to node...')
    const client = await this.sdk.connectRpc()

    this.log('Watching with view key:', incomingViewKey)

    head = head ?? (await api.getBridgeHead())

    if (!head) {
      const chainInfo = await client.chain.getChainInfo()
      head = chainInfo.content.genesisBlockIdentifier.hash
    }

    this.log(`Starting from head ${head}`)

    const response = client.chain.getTransactionStream({
      incomingViewKey: incomingViewKey,
      head,
    })

    const speed = new Meter()
    speed.start()

    const buffer = new Array<GetTransactionStreamResponse>()

    for await (const content of response.contentStream()) {
      if (content.type === 'connected') {
        buffer.push(content)
        speed.add(1)
      } else if (content.type === 'disconnected') {
        buffer.pop()
      }

      this.logger.debug(
        `${content.type}: ${content.block.hash} - ${content.block.sequence}${
          ' - ' +
          TimeUtils.renderEstimate(content.block.sequence, content.head.sequence, speed.rate5m)
        }`,
      )

      if (buffer.length > confirmations) {
        const response = buffer.shift()
        Assert.isNotUndefined(response)
        await this.commit(api, response)
      }
    }
  }

  async commit(api: WebApi, response: GetTransactionStreamResponse): Promise<void> {
    Assert.isNotUndefined(response)

    const sends = []

    const transactions = response.transactions

    for (const transaction of transactions) {
      for (const note of transaction.notes) {
        this.log(`Received deposit ${note.memo} in transaction ${transaction.hash}`)
        sends.push({
          id: Number(note.memo),
          amount: note.value,
          asset: note.assetId,
          source_address: note.sender,
          source_transaction: transaction.hash,
        })
      }
    }

    await api.sendBridgeDeposits(sends)

    await api.setBridgeHead(response.block.hash)
  }
}
