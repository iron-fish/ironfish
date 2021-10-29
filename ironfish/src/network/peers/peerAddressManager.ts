/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ArrayUtils } from '../..'
import { HostsStore } from '../../fileStores'
import { Peer, PeerList } from '..'
import { ConnectionDirection, ConnectionType } from './connections'
import { PeerAddress } from './peerAddress'

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

  addAddressesFromPeerList(peerList: PeerList): void {
    const newAddresses: PeerAddress[] = peerList.payload.connectedPeers.map((peer) => ({
      address: peer.address,
      port: peer.port,
      identity: peer.identity,
      name: peer.name,
    }))

    const possiblePeerSet: Set<string> = new Set(
      ...this.possiblePeerAddresses
        .filter((peerAddress) => !(peerAddress.address == null) && !(peerAddress.port == null))
        .map(
          (filteredPeerAddress) =>
            //eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            `${filteredPeerAddress.address!}:${filteredPeerAddress.port!}`,
        ),
    )

    const dedupedAddresses = newAddresses.filter(
      (newAddress) =>
        !(newAddress.address == null) &&
        !(newAddress.port == null) &&
        !possiblePeerSet.has(`${newAddress.address}:${newAddress.port}`),
    )

    this.hostsStore.set('possiblePeers', [...this.possiblePeerAddresses, ...dedupedAddresses])
  }

  getRandomDisconnectedPeer(peers: Peer[]): PeerAddress {
    const addressSet = new Set(this.possiblePeerAddresses)
    const connectedPeerAdresses: Set<PeerAddress> = new Set(
      peers
        .filter((peer) => peer.state.type === 'CONNECTED' || peer.state.type === 'CONNECTING')
        .map((peer) => ({
          address: peer.address,
          port: peer.port,
          identity: peer.state.identity,
          name: peer.name,
        })),
    )
    const disconnectedAddresses = [...addressSet].filter(
      (address) => !connectedPeerAdresses.has(address),
    )
    return ArrayUtils.sampleOrThrow(disconnectedAddresses)
  }

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
        identity: peer.state.identity,
        name: peer.name,
      }))
    this.hostsStore.set('priorConnectedPeers', [
      ...this.priorConnectedPeerAddresses,
      ...inUsePeerAddresses,
    ])
    await this.hostsStore.save()
  }
}
