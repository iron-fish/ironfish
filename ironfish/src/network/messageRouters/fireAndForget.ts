/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  IncomingPeerMessage,
  LooseMessage,
  Message,
  MessageType,
  PayloadType,
} from '../messages'
import { Peer } from '../peers/peer'
import { PeerManager } from '../peers/peerManager'

export type IncomingFireAndForgetGeneric<T extends MessageType> = IncomingPeerMessage<
  Message<T, PayloadType>
>

export type IncomingFireAndForgetPeerMessage = IncomingFireAndForgetGeneric<MessageType>

/**
 * Trivial router for sending a message to a connected peer without
 * expecting a response or receipt confirmation.
 */
export class FireAndForgetRouter {
  peerManager: PeerManager
  private handlers: Map<
    MessageType,
    (message: IncomingFireAndForgetPeerMessage) => Promise<unknown>
  >

  constructor(peerManager: PeerManager) {
    this.peerManager = peerManager
    this.handlers = new Map<
      MessageType,
      (message: IncomingFireAndForgetPeerMessage) => Promise<unknown>
    >()
  }

  /**
   * Register a callback function for a given type of handler
   */
  register<T extends MessageType>(
    type: T,
    handler: (message: IncomingFireAndForgetGeneric<T>) => Promise<unknown>,
  ): void
  register(
    type: MessageType,
    handler: (message: IncomingFireAndForgetPeerMessage) => Promise<unknown>,
  ): void {
    this.handlers.set(type, handler)
  }

  /**
   * Forward the message directly to the intended recipient.
   */
  fireAndForget(peer: Peer, message: LooseMessage): void {
    this.peerManager.sendTo(peer, message)
  }

  /**
   * Handle an incoming fire and forget message. Just send it up to the
   * handler without any processing.
   */
  async handle(
    peer: Peer,
    message: IncomingFireAndForgetPeerMessage['message'],
  ): Promise<void> {
    const handler = this.handlers.get(message.type)
    if (handler === undefined) {
      return
    }
    const peerIdentity = peer.getIdentityOrThrow()
    await handler({ peerIdentity, message })
  }
}
