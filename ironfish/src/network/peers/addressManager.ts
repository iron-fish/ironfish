/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { HostsStore } from '../../fileStores'
import { Identity } from '../identity'
import { Peer } from '../peers/peer'
import { ConnectionDirection } from './connections'
import { PeerAddress } from './peerAddress'
import { PeerManager } from './peerManager'

/**
 * AddressManager stores the necessary data for connecting to new peers
 * and provides functionality for persistence of said data.
 */
export class AddressManager {
  // we want a number that is larger than the steady state number of peers
  // we connect to (max peers is 50).
  LIMIT = 50

  hostsStore: HostsStore
  peerManager: PeerManager
  peerIdentityMap: Map<Identity, PeerAddress>

  constructor(hostsStore: HostsStore, peerManager: PeerManager) {
    this.hostsStore = hostsStore
    this.peerManager = peerManager
    // load prior peers from disk
    this.peerIdentityMap = new Map<string, PeerAddress>()
    const currentTime = Date.now()
    let priorPeers = this.hostsStore.getArray('priorPeers')

    // If there are more than 200 peers, we remove
    // extra peers from the list. This should only happen during
    // the first time the node is started as this change is implemented.
    if (priorPeers.length > this.LIMIT) {
      priorPeers = priorPeers.slice(0, this.LIMIT)
    }

    for (const peer of priorPeers) {
      if (peer.identity === null) {
        continue
      }

      // Backwards compatible change: if lastAddedTimestamp is undefined or null,
      // set it to the current time.
      peer.lastAddedTimestamp = peer.lastAddedTimestamp || currentTime

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
    if (peer.state.identity === null || peer.state.type !== 'CONNECTED') {
      return
    }

    if (
      !peer.state.connections.webSocket ||
      peer.state.connections.webSocket.direction === ConnectionDirection.Inbound
    ) {
      return
    }

    const peerAddress = this.peerIdentityMap.get(peer.state.identity)

    // if the peer is already in the address manager, update the timestamp
    if (peerAddress) {
      peerAddress.lastAddedTimestamp = Date.now()
      this.peerIdentityMap.set(peer.state.identity, peerAddress)
      return
    }

    // If the address manager is full, remove the oldest peer
    if (this.peerIdentityMap.size > this.LIMIT) {
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

  public async save(): Promise<void> {
    this.hostsStore.set('priorPeers', [...this.peerIdentityMap.values()])
    await this.hostsStore.save()
  }
}
