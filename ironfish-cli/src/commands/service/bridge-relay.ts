/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert, GetTransactionStreamResponse, Meter, TimeUtils, WebApi } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

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
  }

  static args = [
    {
      name: 'head',
      required: false,
      description: 'The block hash to start following at',
    },
  ]

  async start(): Promise<void> {
    const { flags, args } = await this.parse(BridgeRelay)

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

    await this.syncBlocks(api, flags.incomingViewKey, confirmations, args.head)
  }

  async syncBlocks(
    api: WebApi,
    incomingViewKey: string,
    confirmations: number,
    head: string | null,
  ): Promise<void> {
    this.log('Connecting to node...')
    const client = await this.sdk.connectRpc()

    this.log('Watching with view key:', incomingViewKey)

    // TODO: track chain state of relay in API
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

      const committing = buffer.length > confirmations

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
        const response = buffer.shift()
        Assert.isNotUndefined(response)
        this.commit(api, response)
      }
    }
  }

  commit(api: WebApi, response: GetTransactionStreamResponse): void {
    Assert.isNotUndefined(response)

    const transactions = response.transactions

    for (const transaction of transactions) {
      for (const note of transaction.notes) {
        this.log(`Processing deposit ${note.memo}, from transaction ${transaction.hash}`)
        // TODO: get Eth deposit address from API
        // TODO: call Eth bridge contract to mint
      }
    }
  }
}
