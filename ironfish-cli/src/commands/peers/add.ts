/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { DEFAULT_WEBSOCKET_PORT, parseUrl } from '@ironfish/sdk'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class AddCommand extends IronfishCommand {
  static description = `Add a peer to the list of candidates`

  static args = [
    {
      name: 'url',
      parse: (
        input: string,
      ): Promise<{ protocol: string | null; hostname: string | null; port: number | null }> =>
        Promise.resolve(parseUrl(input.trim())),
      required: true,
      description: `The url of the peer to connect to in the form {host}:{port}`,
    },
  ]

  static flags = {
    ...RemoteFlags,
  }

  async start(): Promise<void> {
    const { args } = await this.parse(AddCommand)

    const url = args.url as {
      protocol: string | null
      hostname: string | null
      port: number | null
    }

    const connected = await this.sdk.client.tryConnect()
    if (!connected) {
      this.log('Could not connect to node')
      this.exit(0)
    }

    if (!url.hostname) {
      this.error(`Could not parse the given url`)
    }

    const reqeust = {
      host: url.hostname,
      port: url.port || DEFAULT_WEBSOCKET_PORT,
      whitelist: true,
    }

    const response = await this.sdk.client.peer.addCandidate(reqeust)

    if (response.content.added) {
      this.log(`Successfully added peer ${reqeust.host}:${reqeust.port}`)
    } else {
      this.log(`Could not add peer ${reqeust.host}:${reqeust.port}`)
      this.exit(0)
    }
  }
}
