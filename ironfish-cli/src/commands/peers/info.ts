/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { GetPeerMessagesResponse, GetPeerResponse, TimeUtils } from '@ironfish/sdk'
import { Args } from '@oclif/core'
import colors from 'colors/safe'
import { IronfishCommand } from '../../command'
import { JsonFlags, RemoteFlags } from '../../flags'

type GetPeerResponsePeer = NonNullable<GetPeerResponse['peer']>
type GetPeerMessagesResponseMessages = GetPeerMessagesResponse['messages'][0]

export class PeerInfo extends IronfishCommand {
  static description = `show peer information`
  static enableJsonFlag = true
  static hiddenAliases = ['peers:show']

  static args = {
    identity: Args.string({
      required: true,
      description: 'Identity of the peer',
    }),
  }

  static flags = {
    ...RemoteFlags,
    ...JsonFlags,
  }

  async start(): Promise<unknown> {
    const { args } = await this.parse(PeerInfo)
    const { identity } = args

    const client = await this.connectRpc()
    const [peer, messages] = await Promise.all([
      client.peer.getPeer({ identity }),
      client.peer.getPeerMessages({ identity }),
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

    return {
      ...peer.content,
      ...messages.content,
    }
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
