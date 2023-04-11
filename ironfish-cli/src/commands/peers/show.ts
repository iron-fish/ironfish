/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { GetPeerMessagesResponse, GetPeerResponse, TimeUtils } from '@ironfish/sdk'
import colors from 'colors/safe'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

type GetPeerResponsePeer = NonNullable<GetPeerResponse['peer']>
type GetPeerMessagesResponseMessages = GetPeerMessagesResponse['messages'][0]

export class ShowCommand extends IronfishCommand {
  static description = `Display info about a peer`

  static args = [
    {
      name: 'identity',
      required: true,
      description: 'Identity of the peer',
    },
  ]

  static flags = {
    ...RemoteFlags,
  }

  async start(): Promise<void> {
    const { args } = await this.parse(ShowCommand)

    const identity = (args.identity as string).trim()

    await this.sdk.client.connect()
    const [peer, messages] = await Promise.all([
      this.sdk.client.peer.getPeer({ identity }),
      this.sdk.client.peer.getPeerMessages({ identity }),
    ])

    if (peer.content.peer === null) {
      this.log(`No peer found containing identity '${identity}'.`)
      return this.exit(1)
    }

    this.log(this.renderPeer(peer.content.peer))
    if (messages.content.messages.length === 0) {
      this.log('No messages sent or received. Did you start your node with --logPeerMessages?')
    } else {
      for (const message of messages.content.messages) {
        this.log(this.renderMessage(message))
      }
    }

    this.exit(0)
  }

  renderPeer(peer: GetPeerResponsePeer): string {
    return `Identity: ${String(peer.identity)}\nState: ${peer.state}`
  }

  renderMessage(message: GetPeerMessagesResponseMessages): string {
    const time = TimeUtils.renderTime(message.timestamp)
    const direction = colors.yellow(message.direction === 'send' ? 'SEND' : 'RECV')
    const type = message.brokeringPeerDisplayName
      ? `(broker: ${message.brokeringPeerDisplayName}) ${message.type}`
      : message.type

    const messageType = colors.cyan(message.message.type.toString())
    const payload = message.message.payload

    return `${time} ${direction} ${type}: ${messageType} ${payload}`
  }
}
