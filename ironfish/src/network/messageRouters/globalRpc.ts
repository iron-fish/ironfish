/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ArrayUtils } from '../../utils'
import { Identity } from '../identity'
import { InternalMessageType, Message, MessageType, PayloadType } from '../messages'
import { Peer } from '../peers/peer'
import {
  CannotSatisfyRequestError,
  IncomingRpcGeneric,
  IncomingRpcPeerMessage,
  RpcRouter,
} from './rpc'

/**
 * Number of times to attempt a request with another peer before giving up.
 */
export const RETRIES = 5

/**
 * Router for sending RPC messages where the client doesn't care which
 * peer gives it a response, just that it gets one.
 *
 * This router automatically retries with another peer if the first
 * one fails or times out, and
 */
export class GlobalRpcRouter {
  rpcRouter: RpcRouter
  /**
   * Map of RPC calls per message type to the number of times the message
   * has received a "cannot fulfill request" response from that peer
   * **since the last time a successful event was received**.
   *
   * This is useful to limit the number of requests to recently connected peers
   * that have not received all the necessary data yet, as well as peers that are
   * not storing all of the data.
   */
  requestFails: Map<Identity, Set<MessageType>>

  constructor(router: RpcRouter) {
    this.rpcRouter = router
    this.requestFails = new Map<Identity, Set<MessageType>>()

    // Clear failures when a peer disconnects to avoid memory leaks
    this.rpcRouter.peerManager.onDisconnect.on((peer: Peer) => {
      if (peer.state.identity !== null) {
        this.requestFails.delete(peer.state.identity)
      }
    })
  }

  /**
   * Register a callback function for a given type of handler. This handler
   * is used for incoming RPC requents, and should be responded to as with
   * a normal RPC handler.
   */
  register<T extends MessageType>(
    type: T,
    handler: (message: IncomingRpcGeneric<T>) => Promise<PayloadType>,
  ): void
  register(
    type: MessageType,
    handler: (message: IncomingRpcPeerMessage) => Promise<PayloadType>,
  ): void {
    this.rpcRouter.register(type, async (message: IncomingRpcPeerMessage) => {
      // TODO: I think there will need to be some extra logic around this,
      // but if not, it can be registered with the rpc handler directly
      return await handler(message)
    })
  }

  /**
   * Make the RPC request to a randomly selected connected peer, and return the
   * response. Retries if the peer times out or does not have the necessary data.
   *
   * Throws an error if the request cannot be satisfied after several attempts.
   * Attempts may fail if a peer does not have the requested element
   * (in which case it returns a CannotSatisfyRequest type),
   * or if the individual request times out.
   */
  async request(
    message: Message<MessageType, Record<string, unknown>>,
    toPeer?: Identity,
  ): Promise<IncomingRpcPeerMessage> {
    for (let i = 0; i < RETRIES; i++) {
      const peer = this.selectPeer(message.type, toPeer)

      if (peer === null) {
        throw new CannotSatisfyRequestError(
          `Unable to fulfill request after ${RETRIES} attempts`,
        )
      }
      const peerIdentity = peer.getIdentityOrThrow()

      try {
        const response = await this.rpcRouter.requestFrom(peer, { ...message })
        if (response.message.type !== InternalMessageType.cannotSatisfyRequest) {
          this.requestFails.get(peerIdentity)?.delete(message.type)
          return response
        }
      } catch (error) {
        // Ignore the error here
      }

      if (peer.state.type === 'CONNECTED') {
        const peerRequestFailMap = this.requestFails.get(peerIdentity) || new Set<MessageType>()
        this.requestFails.set(peerIdentity, peerRequestFailMap)
        peerRequestFailMap.add(message.type)
      }
    }

    throw new CannotSatisfyRequestError(`Unable to fulfill request after ${RETRIES} attempts`)
  }

  /**
   * Handle an incoming global RPC message. This may be an incoming request for
   * some data or an incoming repsonse. Either way, we just forward it to the
   * RPC handler.
   */
  async handle(peer: Peer, rpcMessage: IncomingRpcPeerMessage['message']): Promise<void> {
    await this.rpcRouter.handle(peer, rpcMessage)
  }

  /**
   * Choose a peer from the list of connected peers.
   *
   * Prioritizes peers based on their pending RPC messaage count. Filters out
   * saturated peers and peers who have failed this message type, unless all
   * peers have failed, then reset and try them all again.
   *
   * Returns null if we were not able to find a valid candidate
   */
  private selectPeer(type: MessageType, peerIdentity?: Identity): Peer | null {
    if (peerIdentity) {
      const peer = this.rpcRouter.peerManager.getPeer(peerIdentity)
      if (peer && peer.state.type === 'CONNECTED') {
        return peer
      }
    }
    let peers = this.rpcRouter.peerManager.getConnectedPeers().filter((p) => !p.isSaturated)

    // Shuffle peers so we get different peers as a tie breaker for sorting
    // we can make this more efficient later.
    peers = ArrayUtils.shuffle(peers)

    // Try to find the peer with the least pending RPC messages
    peers = peers.sort((a, b) => a.pendingRPC - b.pendingRPC)

    // We have no peers to try
    if (!peers.length) {
      return null
    }

    // find a peer that hasn't failed this MessageType
    for (const peer of peers) {
      const identity = peer.getIdentityOrThrow()
      const peerFails = this.requestFails.get(identity)
      const failed = peerFails?.has(type)
      if (!failed) {
        return peer
      }
    }

    // reset each peers failed state for this MessageType
    for (const peer of peers) {
      const identity = peer.getIdentityOrThrow()
      this.requestFails.get(identity)?.delete(type)
    }

    // because we sorted earlier, this is the lowest pending rpc count
    return peers[0]
  }
}
