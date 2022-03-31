/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IncomingPeerMessage } from '../messages'
import { NetworkMessageType } from '../messages/networkMessage'
import { RpcNetworkMessage } from '../messages/rpcNetworkMessage'

export class MessageRouter {
  protected readonly _handlers: Map<
    NetworkMessageType,
    (message: IncomingPeerMessage<RpcNetworkMessage>) => Promise<RpcNetworkMessage>
  >

  constructor() {
    this._handlers = new Map<
      NetworkMessageType,
      (message: IncomingPeerMessage<RpcNetworkMessage>) => Promise<RpcNetworkMessage>
    >()
  }

  /**
   * Register a callback function for a given type of handler. This is the handler
   * used for incoming *requests*. Incoming responses are handled using futures
   * on the request() function.
   */
  _register(
    type: NetworkMessageType,
    handler: (message: IncomingPeerMessage<RpcNetworkMessage>) => Promise<RpcNetworkMessage>,
  ): void {
    this._handlers.set(type, handler)
  }
}
