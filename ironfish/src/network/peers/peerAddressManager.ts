/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ArrayUtils } from '../..'
import { HostsStore } from '../../fileStores'
import { Peer, PeerList } from '..'
import { ConnectionDirection, ConnectionType } from './connections'
import { PeerAddress } from './peerAddress'

/**
 * PeerAddressManager stores the necessary data for connecting to new peers
 * and provides functionality for persistence of said data.
 */
export class PeerAddressManager {
  hostsStore: HostsStore

  constructor(hostsStore: HostsStore) {
    this.hostsStore = hostsStore
  }

  get priorConnectedPeerAddresses(): ReadonlyArray<Readonly<PeerAddress>> {
    return this.hostsStore.getArray('priorConnectedPeers')
  }

  get possiblePeerAddresses(): ReadonlyArray<Readonly<PeerAddress>> {
    return this.hostsStore.getArray('possiblePeers')
  }

  /**
   * Adds addresses associated to peers received from peer list
   */
  addAddressesFromPeerList(peerList: PeerList): void {
    const newAddresses: PeerAddress[] = peerList.payload.connectedPeers.map((peer) => ({
      address: peer.address,
      port: peer.port,
      identity: peer.identity ?? null,
      name: peer.name ?? null,
    }))

    const possiblePeerStrings = this.possiblePeerAddresses
      .filter((peerAddress) => !(peerAddress.address == null) && !(peerAddress.port == null))
      .map(
        (filteredPeerAddress) =>
          //eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          `${filteredPeerAddress.address!}:${filteredPeerAddress.port!}`,
      )
    const possiblePeerSet = new Set(possiblePeerStrings)

    const dedupedAddresses = newAddresses.filter(
      (newAddress) =>
        !(newAddress.address == null) &&
        !(newAddress.port == null) &&
        !possiblePeerSet.has(`${newAddress.address}:${newAddress.port}`),
    )

    if (dedupedAddresses.length) {
      this.hostsStore.set('possiblePeers', [...this.possiblePeerAddresses, ...dedupedAddresses])
    }
  }

  /**
   * Returns a peer address for a disconnected peer by using current peers to
   * filter out connected peer addresses
   */
  getRandomDisconnectedPeerAddress(peers: Peer[]): PeerAddress {
    const addressSet = new Set(this.possiblePeerAddresses)
    const connectedPeerAdresses: Set<PeerAddress> = new Set(
      peers
        .filter((peer) => peer.state.type === 'CONNECTED' || peer.state.type === 'CONNECTING')
        .map((peer) => ({
          address: peer.address,
          port: peer.port,
          identity: peer.state.identity ?? null,
          name: peer.name ?? null,
        })),
    )
    const disconnectedAddresses = [...addressSet].filter(
      (address) => !connectedPeerAdresses.has(address),
    )
    return ArrayUtils.sampleOrThrow(disconnectedAddresses)
  }

  /**
   * Removes address associated with a peer from address stores
   */
  removePeerAddress(peer: Peer): void {
    const filteredPossibles = this.possiblePeerAddresses.filter(
      (possible) => possible.address !== peer.address && possible.port !== peer.port,
    )
    const filteredPriorConnected = this.priorConnectedPeerAddresses.filter(
      (prior) => prior.address !== peer.address && prior.port !== peer.port,
    )

    this.hostsStore.set('possiblePeers', filteredPossibles)
    this.hostsStore.set('priorConnectedPeers', filteredPriorConnected)
  }

  /**
   * Persist all currently connected peers and unused peer addresses to disk
   */
  async save(peers: Peer[]): Promise<void> {
    const inUsePeerAddresses = peers
      .filter(
        (peer) =>
          peer.state.type === 'CONNECTED' &&
          !peer.getConnectionRetry(ConnectionType.WebSocket, ConnectionDirection.Outbound)
            ?.willNeverRetryConnecting,
      )
      .map((peer) => ({
        address: peer.address,
        port: peer.port,
        identity: peer.state.identity ?? null,
        name: peer.name ?? null,
      }))
    this.hostsStore.set('priorConnectedPeers', [
      ...this.priorConnectedPeerAddresses,
      ...inUsePeerAddresses,
    ])
    await this.hostsStore.save()
  }
}
