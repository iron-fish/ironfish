/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { HostsStore } from '../../fileStores'
import { ArrayUtils } from '../../utils'
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
  hostsStore: HostsStore
  peerManager: PeerManager
  peerIdentityMap: Map<Identity, PeerAddress>

  constructor(hostsStore: HostsStore, peerManager: PeerManager) {
    this.hostsStore = hostsStore
    this.peerManager = peerManager
    // load prior peers from disk
    this.peerIdentityMap = new Map<string, PeerAddress>()
    for (const peer of this.hostsStore.getArray('priorPeers')) {
      if (peer.identity === null) {
        continue
      }

      this.peerIdentityMap.set(peer.identity, peer)
    }
  }

  get priorConnectedPeerAddresses(): ReadonlyArray<Readonly<PeerAddress>> {
    return [...this.peerIdentityMap.values()]
  }

  /**
   * Returns a peer address for a disconnected peer by using current peers to
   * filter out peer addresses. It attempts to find a previously-connected
   * peer address that is not part of an active connection.
   */
  getRandomDisconnectedPeerAddress(peerIdentities: string[]): PeerAddress | null {
    if (this.priorConnectedPeerAddresses.length === 0) {
      return null
    }

    const currentPeerIdentities = new Set(peerIdentities)

    const disconnectedPriorAddresses = this.priorConnectedPeerAddresses.filter(
      (address) => address.identity !== null && !currentPeerIdentities.has(address.identity),
    )

    if (disconnectedPriorAddresses.length) {
      return ArrayUtils.sampleOrThrow(disconnectedPriorAddresses)
    }

    return null
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

  incrementFailedAttemps(peer: Peer): void {
    if (peer.state.identity === null) {
      return
    }
  }

  /**
   * Adds a peer to the address stores
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

    if (peerAddress) {
      // reset failed attempts
      this.peerIdentityMap.set(peer.state.identity, peerAddress)
      return
    }

    this.peerIdentityMap.set(peer.state.identity, {
      address: peer.address,
      port: peer.port,
      identity: peer.state.identity,
      name: peer.name ?? null,
    })

    void this.save()
  }

  private async save(): Promise<void> {
    this.hostsStore.set('priorPeers', [...this.peerIdentityMap.values()])
    await this.hostsStore.save()
  }
}
