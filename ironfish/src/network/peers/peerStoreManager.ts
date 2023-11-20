/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PeerAddress, PeerStore } from '../../fileStores'
import { PriorityQueue } from '../../utils'
import { formatFullWebSocketAddress, formatWebSocketAddress } from '../utils/url'
import { ConnectionDirection } from './connections'
import { Peer } from './peer'

export const MAX_PEER_ADDRESSES = 50

/**
 * PeerStoreManager stores the necessary data for connecting to peers on startup
 * to speed up connecting to the network.
 */
export class PeerStoreManager {
  peerStore: PeerStore

  // Sort the peers with the oldest peer at the front of the queue
  private peers = new PriorityQueue<PeerAddress>(
    (p1, p2) => p1.lastAddedTimestamp < p2.lastAddedTimestamp,
    (p) => formatFullWebSocketAddress({ host: p.address, port: p.port }),
  )

  constructor(peerStore: PeerStore) {
    this.peerStore = peerStore

    // Load prior peers from disk
    for (const peer of this.peerStore.getPriorPeers()) {
      const existing = this.peers.remove(this.peers.hash(peer))

      if (existing && existing.lastAddedTimestamp > peer.lastAddedTimestamp) {
        this.insertPeerAddress(existing)
      } else {
        this.insertPeerAddress(peer)
      }
    }
  }

  get priorConnectedPeerAddresses(): ReadonlyArray<Readonly<PeerAddress>> {
    return [...this.peers.sorted()]
  }

  /**
   * Removes address associated with a peer from address stores
   */
  async removePeer(peer: Peer): Promise<void> {
    const toRemove = formatWebSocketAddress(peer.wsAddress)

    if (toRemove) {
      this.peers.remove(toRemove)
      await this.save()
    }
  }

  /**
   * Adds a peer if the peer has an outbound websocket connection
   */
  async addPeer(peer: Peer): Promise<void> {
    if (
      peer.wsAddress === null ||
      peer.wsAddress.port === null ||
      peer.state.type !== 'CONNECTED' ||
      !peer.state.connections.webSocket ||
      peer.state.connections.webSocket.direction !== ConnectionDirection.Outbound
    ) {
      return
    }

    this.insertPeerAddress({
      address: peer.wsAddress.host,
      port: peer.wsAddress.port,
      name: peer.name ?? null,
      lastAddedTimestamp: Date.now(),
    })

    await this.save()
  }

  private insertPeerAddress(peerAddress: PeerAddress) {
    this.peers.remove(this.peers.hash(peerAddress))
    this.peers.add(peerAddress)

    // Make sure we don't store too many peers
    while (this.peers.size() > MAX_PEER_ADDRESSES) {
      this.peers.poll()
    }
  }

  async save(): Promise<void> {
    this.peerStore.set('priorPeers', [...this.peers.sorted()])
    await this.peerStore.save()
  }
}
