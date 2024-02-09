/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import net from 'net'
import { Assert } from '../../assert'
import { MessageBuffer } from '../../rpc/messageBuffer'

type V1Subscription = {
  version: 1
  publicAddress: string
  name?: string
  agent?: string
  graffiti: Buffer
}

type V2Subscription = {
  version: 2
  publicAddress: string
  name?: string
  agent?: string
  xn: string
}

type V3Subscription = {
  version: 3
  publicAddress: string
  name?: string
  agent?: string
  xn: string
}

export class StratumServerClient {
  id: number
  socket: net.Socket
  connected: boolean
  remoteAddress: string
  subscription: V1Subscription | V2Subscription | V3Subscription | null = null
  messageBuffer: MessageBuffer

  private constructor(options: { socket: net.Socket; id: number }) {
    this.id = options.id
    this.socket = options.socket
    this.connected = true
    this.messageBuffer = new MessageBuffer('\n')

    Assert.isNotUndefined(this.socket.remoteAddress)
    this.remoteAddress = this.socket.remoteAddress
  }

  static accept(socket: net.Socket, id: number): StratumServerClient {
    return new StratumServerClient({ socket, id })
  }

  close(error?: Error): void {
    if (!this.connected) {
      return
    }

    this.messageBuffer.clear()
    this.connected = false
    this.socket.destroy(error)
  }
}
