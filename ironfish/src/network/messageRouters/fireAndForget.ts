/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  IncomingPeerMessage,
  NetworkMessage,
  NetworkMessageType,
} from '../messages/networkMessage'
import { Peer } from '../peers/peer'
import { PeerManager } from '../peers/peerManager'

/**
 * Trivial router for sending a message to a connected peer without
 * expecting a response or receipt confirmation.
 */
export class FireAndForgetRouter {
  peerManager: PeerManager
  private handlers: Map<
    NetworkMessageType,
    (message: IncomingPeerMessage<NetworkMessage>) => void
  >

  constructor(peerManager: PeerManager) {
    this.peerManager = peerManager
    this.handlers = new Map<
      NetworkMessageType,
      (message: IncomingPeerMessage<NetworkMessage>) => void
    >()
  }

  /**
   * Register a callback function for a given type of handler
   */
  register(
    type: NetworkMessageType,
    handler: (message: IncomingPeerMessage<NetworkMessage>) => void,
  ): void {
    this.handlers.set(type, handler)
  }

  /**
   * Forward the message directly to the intended recipient.
   */
  fireAndForget(peer: Peer, message: NetworkMessage): void {
    this.peerManager.sendTo(peer, message)
  }

  /**
   * Handle an incoming fire and forget message. Just send it up to the
   * handler without any processing.
   */
  handle(peer: Peer, message: NetworkMessage): void {
    const handler = this.handlers.get(message.type)
    if (handler === undefined) {
      return
    }
    const peerIdentity = peer.getIdentityOrThrow()
    handler({ peerIdentity, message })
  }
}
