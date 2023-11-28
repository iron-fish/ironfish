/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import http from 'http'
import WSWebSocket from 'ws'
import { WEBSOCKET_OPTIONS } from './webSocketServer'

/**
 * A simple wrapper around WSWebSocket to allow passing options when being used
 * as an IsomorphicWebSocket
 */
export class WebSocketClient extends WSWebSocket {
  constructor(
    address: string,
    protocols?: string | string[],
    options?: WSWebSocket.ClientOptions | http.ClientRequestArgs,
  ) {
    const opts = {
      ...WEBSOCKET_OPTIONS,
      ...options,
    }
    super(address, protocols, opts)
  }
}
