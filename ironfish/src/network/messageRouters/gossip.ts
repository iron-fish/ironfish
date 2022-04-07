/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { RollingFilter } from 'bfilter'
import { GossipNetworkMessage } from '../messages/gossipNetworkMessage'
import { IncomingPeerMessage, NetworkMessageType } from '../messages/networkMessage'
import { Peer } from '../peers/peer'
import { PeerManager } from '../peers/peerManager'

/**
 * We store gossips that have already been seen and processed, and ignore them
 * if we have seen them before. The set that contains these gossips is
 * bounded to a specific size and old ones are evicted in the order
 * they were inserted.
 */
const GOSSIP_FILTER_SIZE = 100000
const GOSSIP_FILTER_FP_RATE = 0.000001

/**
 * Router for gossip-style messages. Maintains a list of handlers and is responsible
 * for sending and receiving the messages.
 */
export class GossipRouter {
  peerManager: PeerManager
  private seenGossipFilter: RollingFilter
  private handlers: Map<
    NetworkMessageType,
    (
      message: IncomingPeerMessage<GossipNetworkMessage>,
    ) => Promise<boolean | void> | boolean | void
  >

  constructor(peerManager: PeerManager) {
    this.peerManager = peerManager
    this.seenGossipFilter = new RollingFilter(GOSSIP_FILTER_SIZE, GOSSIP_FILTER_FP_RATE)
    this.handlers = new Map<
      NetworkMessageType,
      (
        message: IncomingPeerMessage<GossipNetworkMessage>,
      ) => Promise<boolean | void> | boolean | void
    >()
  }

  /**
   * Register a callback function for a certain type of handler.
   */
  register(
    type: NetworkMessageType,
    handler: (
      message: IncomingPeerMessage<GossipNetworkMessage>,
    ) => Promise<boolean | void> | boolean | void,
  ): void {
    this.handlers.set(type, handler)
  }

  /**
   * Pack the message in a Gossip envelope and send it to all connected peers with
   * the expectation that they will forward it to their other peers.
   * The goal is for everyone to receive the message.
   */
  gossip(message: GossipNetworkMessage): void {
    // TODO: A uuid takes up a lot of bytes, might be a better choice available
    this.seenGossipFilter.add(message.nonce, 'utf-8')
    this.peerManager.broadcast(message)
  }

  async handle(peer: Peer, gossipMessage: GossipNetworkMessage): Promise<void> {
    const handler = this.handlers.get(gossipMessage.type)
    if (handler === undefined) {
      return
    }

    if (!this.seenGossipFilter.added(gossipMessage.nonce, 'utf-8')) {
      return
    }

    const peerIdentity = peer.getIdentityOrThrow()

    const gossip = await handler({ peerIdentity, message: gossipMessage })
    if (!gossip) {
      return
    }

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
  }
}
