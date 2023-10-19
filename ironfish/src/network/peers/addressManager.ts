/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { HostsStore } from '../../fileStores'
import { createRootLogger, Logger } from '../../logger'
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
  // we want a number that is larger than the steady state number of peers
  // we connect to (max peers is 50).
  private LIMIT = 200

  private readonly logger: Logger
  hostsStore: HostsStore
  peerManager: PeerManager
  peerIdentityMap: Map<Identity, PeerAddress>

  constructor(hostsStore: HostsStore, peerManager: PeerManager) {
    this.logger = createRootLogger().withTag('addressManager')
    this.hostsStore = hostsStore
    this.peerManager = peerManager
    // load prior peers from disk
    this.peerIdentityMap = new Map<string, PeerAddress>()
    const currentTime = Date.now()
    for (const peer of this.hostsStore.getArray('priorPeers')) {
      if (peer.identity === null) {
        continue
      }

      if (peer.lastAddedTimestamp === undefined) {
        peer.lastAddedTimestamp = currentTime
      }

      this.peerIdentityMap.set(peer.identity, peer)
    }

    if (this.peerIdentityMap.size > this.LIMIT) {
      this.logger.warn(
        `Address manager loaded ${this.peerIdentityMap.size} peers, which is more than the limit of ${this.LIMIT}.`,
      )
      // remove the oldest peers
      const oldestPeers = [...this.peerIdentityMap.entries()].sort(
        (a, b) => a[1].lastAddedTimestamp - b[1].lastAddedTimestamp,
      )
      for (let i = 0; i < oldestPeers.length - this.LIMIT; i++) {
        this.peerIdentityMap.delete(oldestPeers[i][0])
      }
    }

    void this.save()
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
      peerAddress.lastAddedTimestamp = Date.now()
      this.peerIdentityMap.set(peer.state.identity, peerAddress)
      return
    }

    if (this.peerIdentityMap.size >= this.LIMIT) {
      // remove the oldest peer
      const oldestPeer = [...this.peerIdentityMap.entries()].sort(
        (a, b) => a[1].lastAddedTimestamp - b[1].lastAddedTimestamp,
      )[0]

      if (oldestPeer) {
        this.logger.log(`Removing oldest peer ${oldestPeer[0]} from address manager.`)
        this.peerIdentityMap.delete(oldestPeer[0])
      }
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

  private async save(): Promise<void> {
    this.hostsStore.set('priorPeers', [...this.peerIdentityMap.values()])
    await this.hostsStore.save()
  }
}
