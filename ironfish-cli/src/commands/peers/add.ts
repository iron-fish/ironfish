/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { DEFAULT_WEBSOCKET_PORT, parseUrl } from '@ironfish/sdk'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class AddCommand extends IronfishCommand {
  static description = `Attempt to connect to a peer through websockets`

  static args = [
    {
      name: 'address',
      parse: (
        input: string,
      ): Promise<{ protocol: string | null; hostname: string | null; port: number | null }> =>
        Promise.resolve(parseUrl(input.trim())),
      required: true,
      description: `The address of the peer to connect to in the form {host}:{port}`,
    },
  ]

  static flags = {
    ...RemoteFlags,
  }

  async start(): Promise<void> {
    const { args } = await this.parse(AddCommand)

    const address = args.address as {
      protocol: string | null
      hostname: string | null
      port: number | null
    }

    const connected = await this.sdk.client.tryConnect()
    if (!connected) {
      this.log('Could not connect to node')
      this.exit(0)
    }

    if (!address.hostname) {
      this.error(`Could not parse the given url`)
    }

    const request = {
      host: address.hostname,
      port: address.port || DEFAULT_WEBSOCKET_PORT,
      whitelist: true,
    }

    const response = await this.sdk.client.peer.addPeer(request)

    if (response.content.added) {
      this.log(`Successfully added peer ${request.host}:${request.port}`)
    } else if (response.content.error !== undefined) {
      this.log(
        `Failed to add peer ${request.host}:${request.port} because: ${response.content.error}`,
      )
      this.exit(0)
    } else {
      this.log(`Could not add peer ${request.host}:${request.port}`)
      this.exit(0)
    }
  }
}
