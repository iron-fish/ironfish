/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { HostsStore } from '../../fileStores'
import { Identity } from '../identity'
import { Peer } from '../peers/peer'
import { ConnectionDirection } from './connections'
import { PeerAddress } from './peerAddress'
import { PeerManager } from './peerManager'

export const MAX_PEER_ADDRESSES = 50

/**
 * AddressManager stores the necessary data for connecting to new peers
 * and provides functionality for persistence of said data.
 */
export class AddressManager {
  hostsStore: HostsStore
  peerManager: PeerManager
  private peerIdentityMap: Map<Identity, PeerAddress>

  constructor(hostsStore: HostsStore, peerManager: PeerManager) {
    this.hostsStore = hostsStore
    this.peerManager = peerManager
    // Load prior peers from disk
    this.peerIdentityMap = new Map<string, PeerAddress>()

    let priorPeers = this.hostsStore.getArray('priorPeers').filter((peer) => {
      if (peer.identity === null || peer.address === null || peer.port === null) {
        return false
      }
      // Backwards compatible change: if lastAddedTimestamp is undefined or null,
      // set it to the current time.
      if (peer.lastAddedTimestamp === undefined) {
        peer.lastAddedTimestamp = 0
      }
      return true
    })

    // If there are more than 50 peers, we remove
    // extra peers from the list. This should only happen during
    // the first time the node is started after this change is implemented.
    if (priorPeers.length > MAX_PEER_ADDRESSES) {
      priorPeers = priorPeers.slice(0, MAX_PEER_ADDRESSES)
    }

    for (const peer of priorPeers) {
      this.peerIdentityMap.set(peer.identity, peer)
    }

    void this.save()
  }

  get priorConnectedPeerAddresses(): ReadonlyArray<Readonly<PeerAddress>> {
    return [...this.peerIdentityMap.values()]
  }

  /**
   * Removes address associated with a peer from address stores
   */
  removePeer(peer: Peer): void {
    if (peer.state.identity === null) {
      return
    }

    this.peerIdentityMap.delete(peer.state.identity)
    void this.save()
  }

  /**
   * Adds a peer with the following conditions:
   * 1. Peer is connected
   * 2. Identity is valid
   * 3. Peer has an outbound websocket connection
   */
  addPeer(peer: Peer): void {
    if (peer.state.identity === null || peer.address === null || peer.port === null) {
      return
    }

    if (
      peer.state.type !== 'CONNECTED' ||
      !peer.state.connections.webSocket ||
      peer.state.connections.webSocket.direction !== ConnectionDirection.Outbound
    ) {
      return
    }

    const peerAddress = this.peerIdentityMap.get(peer.state.identity)

    // If the peer is already in the address manager, update the timestamp,
    // address and port
    if (peerAddress) {
      peerAddress.address = peer.address
      peerAddress.port = peer.port
      peerAddress.lastAddedTimestamp = Date.now()
      this.peerIdentityMap.set(peer.state.identity, peerAddress)
      void this.save()
      return
    }

    // If the address manager is full, remove the oldest peer
    if (this.peerIdentityMap.size >= MAX_PEER_ADDRESSES) {
      const oldestPeerIdentity = [...this.peerIdentityMap.entries()].sort(
        (a, b) => a[1].lastAddedTimestamp - b[1].lastAddedTimestamp,
      )[0][0]

      this.peerIdentityMap.delete(oldestPeerIdentity)
    }

    this.peerIdentityMap.set(peer.state.identity, {
      address: peer.address,
      port: peer.port,
      identity: peer.state.identity,
      name: peer.name ?? null,
      lastAddedTimestamp: Date.now(),
    })

    void this.save()
  }

  async save(): Promise<void> {
    this.hostsStore.set('priorPeers', [...this.peerIdentityMap.values()])
    await this.hostsStore.save()
  }
}
