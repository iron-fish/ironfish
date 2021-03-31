/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MessageType, IncomingPeerMessage, Message, isMessage, PayloadType } from '../messages'
import { v4 as uuid } from 'uuid'
import EvictingSet from '../utils/evictingSet'
import { PeerManager } from '../peers/peerManager'
import { Peer } from '../peers/peer'

/**
 * We store gossips that have already been seen and processed, and ignore them
 * if we have seen them before. The set that contains these gossips is
 * bounded to a specific size and old ones are evicted in the order
 * they were inserted.
 */
const MAX_SEEN_GOSSIPS_SIZE = 1000

type IncomingGossipGeneric<T extends MessageType> = IncomingPeerMessage<Gossip<T, PayloadType>>
type IncomingGossipPeerMessage = IncomingGossipGeneric<MessageType>

export type Gossip<T extends MessageType, P extends PayloadType> = Message<T, P> & {
  // Each message gets a unique identifier
  nonce: string
}

export function isGossip(obj: unknown): obj is Gossip<MessageType, PayloadType> {
  return isMessage(obj) && typeof (obj as Gossip<MessageType, PayloadType>).nonce == 'string'
}

/**
 * Router for gossip-style messages. Maintains a list of handlers and is responsible
 * for sending and receiving the messages.
 */
export class GossipRouter {
  peerManager: PeerManager
  private seenGossips: EvictingSet<string>
  private handlers: Map<MessageType, (message: IncomingGossipPeerMessage) => Promise<unknown>>

  constructor(peerManager: PeerManager) {
    this.peerManager = peerManager
    this.seenGossips = new EvictingSet(MAX_SEEN_GOSSIPS_SIZE)
    this.handlers = new Map<
      MessageType,
      (message: IncomingPeerMessage<Gossip<MessageType, PayloadType>>) => Promise<unknown>
    >()
  }

  hasHandler(type: MessageType): boolean {
    return this.handlers.has(type)
  }

  /**
   * Register a callback function for a certain type of handler.
   */
  register<T extends MessageType>(
    type: T,
    handler: (message: IncomingGossipGeneric<T>) => Promise<unknown>,
  ): void
  register(
    type: MessageType,
    handler: (message: IncomingGossipPeerMessage) => Promise<unknown>,
  ): void {
    this.handlers.set(type, handler)
  }

  /**
   * Pack the message in a Gossip envelope and send it to all connected peers with
   * the expectation that they will forward it to their other peers.
   * The goal is for everyone to receive the message.
   */
  gossip<T extends MessageType, P extends PayloadType>(message: Message<T, P>): void {
    // TODO: A uuid takes up a lot of bytes, might be a better choice available
    const nonce = uuid()
    const gossipMessage: Gossip<T, P> = {
      ...message,
      nonce,
    }
    this.peerManager.broadcast(gossipMessage)
    this.seenGossips.add(nonce)
  }

  async handle(peer: Peer, gossipMessage: IncomingGossipPeerMessage['message']): Promise<void> {
    const handler = this.handlers.get(gossipMessage.type)
    if (handler === undefined) return

    if (this.seenGossips.has(gossipMessage.nonce)) {
      return
    }

    const peerIdentity = peer.getIdentityOrThrow()

    const peersConnections =
      this.peerManager.identifiedPeers.get(peerIdentity)?.knownPeers || new Map<string, Peer>()
    for (const activePeer of this.peerManager.getConnectedPeers()) {
      if (activePeer.state.type !== 'CONNECTED') {
        throw new Error('Peer not in state CONNECTED returned from getConnectedPeers')
      }
      // To reduce network noise, we don't send the message back to the peer that
      // sent it to us, or any of the peers connected to it
      if (
        activePeer.state.identity === peerIdentity ||
        (peersConnections.has(activePeer.state.identity) &&
          peersConnections.get(activePeer.state.identity)?.state.type === 'CONNECTED')
      ) {
        continue
      }
      activePeer.send(gossipMessage)
    }
    this.seenGossips.add(gossipMessage.nonce)
    await handler({ peerIdentity, message: gossipMessage })
  }
}
