/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import net from 'net'
import { Assert } from '../../assert'

export class StratumServerClient {
  id: number
  socket: net.Socket
  connected: boolean
  subscribed: boolean
  publicAddress: string | null = null
  remoteAddress: string
  graffiti: Buffer | null = null
  messageBuffer: string

  private constructor(options: { socket: net.Socket; id: number }) {
    this.id = options.id
    this.socket = options.socket
    this.connected = true
    this.subscribed = false
    this.messageBuffer = ''

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

    this.messageBuffer = ''
    this.connected = false
    this.socket.removeAllListeners()
    this.socket.destroy(error)
  }
}
