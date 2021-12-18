/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import http from 'http'
import WSWebSocket from 'ws'
import { MAX_MESSAGE_SIZE } from '../consensus/consensus'

export class WebSocketServer {
  // The server instance
  readonly server: WSWebSocket.Server

  constructor(ctor: typeof WSWebSocket.Server, port: number) {
    this.server = new ctor({ port, maxPayload: MAX_MESSAGE_SIZE })
  }

  /**
   * Fired when the server is ready to accept connections. Callback will only
   * be executed once.
   * @param cb Callback function to be executed.
   */
  onStart(cb: (ws: WSWebSocket) => void): void {
    this.server.once('listening', cb)
  }

  onConnection(cb: (ws: WSWebSocket, req: http.IncomingMessage) => void): void {
    this.server.on('connection', cb)
  }

  close(): void {
    this.server.close()
  }
}
