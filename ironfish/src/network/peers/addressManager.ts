/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Peer, PeerList } from '..'
import { HostsStore } from '../../fileStores'
import { FileSystem } from '../../fileSystems'
import { ArrayUtils } from '../../utils'
import { ConnectionDirection, ConnectionType } from './connections'
import { PeerAddress } from './peerAddress'

/**
 * AddressManager stores the necessary data for connecting to new peers
 * and provides functionality for persistence of said data.
 */
export class AddressManager {
  hostsStore: HostsStore

  constructor(files: FileSystem, dataDir?: string) {
    this.hostsStore = new HostsStore(files, dataDir)
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.hostsStore.load()
  }

  get priorConnectedPeerAddresses(): ReadonlyArray<Readonly<PeerAddress>> {
    return this.hostsStore.getArray('priorPeers')
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
   * filter out peer addresses. It attempts to find a previously-connected
   * peer address that is not part of an active connection. If there are none,
   * then it attempts to find a previously-known peer address.
   */
  getRandomDisconnectedPeerAddress(peers: Peer[]): PeerAddress | null {
    if (
      this.possiblePeerAddresses.length === 0 &&
      this.priorConnectedPeerAddresses.length === 0
    ) {
      return null
    }

    const currentPeerAddresses = new Set(
      //eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      peers.filter((peer) => peer.state.identity !== null).map((peer) => peer.state.identity!),
    )

    const priorConnectedAddressSet = new Set([...this.priorConnectedPeerAddresses])

    const disconnectedPriorAddresses = this.filterConnectedAddresses(
      priorConnectedAddressSet,
      currentPeerAddresses,
    )
    if (disconnectedPriorAddresses.length) {
      return ArrayUtils.sampleOrThrow(disconnectedPriorAddresses)
    } else {
      const possibleAddressSet = new Set([...this.possiblePeerAddresses])
      const disconnectedPossibleAddresses = this.filterConnectedAddresses(
        possibleAddressSet,
        currentPeerAddresses,
      )
      if (disconnectedPossibleAddresses.length) {
        return ArrayUtils.sampleOrThrow(disconnectedPossibleAddresses)
      } else {
        return null
      }
    }
  }

  private filterConnectedAddresses(
    addressSet: Set<Readonly<PeerAddress>>,
    connectedPeerAdresses: Set<string>,
  ): PeerAddress[] {
    const disconnectedAddresses = [...addressSet].filter(
      (address) => address.identity !== null && !connectedPeerAdresses.has(address.identity),
    )

    return disconnectedAddresses
  }

  /**
   * Removes address associated with a peer from address stores
   */
  removePeerAddress(peer: Peer): void {
    const filteredPossibles = this.possiblePeerAddresses.filter(
      (possible) => possible.identity !== peer.state.identity,
    )
    const filteredPriorConnected = this.priorConnectedPeerAddresses.filter(
      (prior) => prior.identity !== peer.state.identity,
    )

    this.hostsStore.set('possiblePeers', filteredPossibles)
    this.hostsStore.set('priorPeers', filteredPriorConnected)
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
    this.hostsStore.set('priorPeers', [...inUsePeerAddresses])
    await this.hostsStore.save()
  }
}
