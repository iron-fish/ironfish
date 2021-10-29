/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ArrayUtils } from '../..'
import { HostsStore } from '../../fileStores'
import { Peer, PeerList } from '..'
import { PeerAddress } from './peerAddress'

export class PeerAddressManager {
  hostsStore: HostsStore

  constructor(hostsStore: HostsStore) {
    this.hostsStore = hostsStore
  }

  get addresses(): ReadonlyArray<Readonly<PeerAddress>> {
    return this.hostsStore.getArray('knownPeers')
  }

  addAddressesFromPeerList(peerList: PeerList): void {
    const newAddresses: PeerAddress[] = peerList.payload.connectedPeers.map((peer) => ({
      address: peer.address,
      port: peer.port,
      identity: peer.identity,
      name: peer.name,
    }))

    this.hostsStore.set('knownPeers', [...this.addresses, ...newAddresses])
  }

  getRandomDisconnectedPeer(peers: Peer[]): PeerAddress {
    const addressSet = new Set(this.addresses)
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
    const inUseAddrs = peers
      .filter((peer) => peer.state.type === 'CONNECTED')
      .map((peer) => ({
        address: peer.address,
        port: peer.port,
        identity: peer.state.identity,
      }))
    this.hostsStore.set('knownPeers', inUseAddrs)
    await this.hostsStore.save()
  }
}
