/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export default class Watch extends IronfishCommand {
  static hidden = true

  static flags = {
    ...RemoteFlags,
    viewKey: Flags.string({
      char: 'k',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: true,
      description: 'View key to watch transactions with',
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
    const { flags, args } = await this.parse(Watch)

    this.log('Watching with view key:', flags.viewKey)

    const head = args.head as string | null

    if (head) {
      this.log(`Starting from head ${head}`)
    }

    await this.sdk.client.connect()

    const response = await this.sdk.client.getTransactionStream({
      incomingViewKey: flags.viewKey,
      head: head,
    })

    for await (const value of response.contentStream()) {
      console.log('Received:', value)
    }
  }
}
