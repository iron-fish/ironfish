/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert, MessageBuffer } from '@ironfish/sdk'
import net from 'net'

export class MultisigServerClient {
  id: number
  socket: net.Socket
  connected: boolean
  remoteAddress: string
  messageBuffer: MessageBuffer

  private constructor(options: { socket: net.Socket; id: number }) {
    this.id = options.id
    this.socket = options.socket
    this.connected = true
    this.messageBuffer = new MessageBuffer('\n')

    Assert.isNotUndefined(this.socket.remoteAddress)
    this.remoteAddress = this.socket.remoteAddress
  }

  static accept(socket: net.Socket, id: number): MultisigServerClient {
    return new MultisigServerClient({ socket, id })
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
