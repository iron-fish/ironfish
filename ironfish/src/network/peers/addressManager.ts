/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { HostsStore } from '../../fileStores'
import { ArrayUtils } from '../../utils'
import { Peer } from '../peers/peer'
import { ConnectionDirection, ConnectionType } from './connections'
import { PeerAddress } from './peerAddress'

/**
 * AddressManager stores the necessary data for connecting to new peers
 * and provides functionality for persistence of said data.
 */
export class AddressManager {
  hostsStore: HostsStore

  constructor(hostsStore: HostsStore) {
    this.hostsStore = hostsStore
  }

  get priorConnectedPeerAddresses(): ReadonlyArray<Readonly<PeerAddress>> {
    return this.hostsStore.getArray('priorPeers')
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

    const disconnectedPriorAddresses = this.filterConnectedIdentities(
      this.priorConnectedPeerAddresses,
      currentPeerIdentities,
    )
    if (disconnectedPriorAddresses.length) {
      return ArrayUtils.sampleOrThrow(disconnectedPriorAddresses)
    }

    return null
  }

  private filterConnectedIdentities(
    priorConnectedAddresses: readonly Readonly<PeerAddress>[],
    connectedPeerIdentities: Set<string>,
  ): PeerAddress[] {
    const disconnectedAddresses = priorConnectedAddresses.filter(
      (address) => address.identity !== null && !connectedPeerIdentities.has(address.identity),
    )

    return disconnectedAddresses
  }

  /**
   * Removes address associated with a peer from address stores
   */
  removePeerAddress(peer: Peer): void {
    const filteredPriorConnected = this.priorConnectedPeerAddresses.filter(
      (prior) => prior.identity !== peer.state.identity,
    )

    this.hostsStore.set('priorPeers', filteredPriorConnected)
  }

  /**
   * Persist all currently connected peers and unused peer addresses to disk
   */
  async save(peers: Peer[]): Promise<void> {
    // TODO: Ideally, we would like persist peers with whom we've
    // successfully established an outbound Websocket connection at
    // least once.
    const inUsePeerAddresses: PeerAddress[] = peers.flatMap((peer) => {
      if (
        peer.state.type === 'CONNECTED' &&
        !peer.getConnectionRetry(ConnectionType.WebSocket, ConnectionDirection.Outbound)
          .willNeverRetryConnecting
      ) {
        return {
          address: peer.address,
          port: peer.port,
          identity: peer.state.identity ?? null,
          name: peer.name ?? null,
        }
      } else {
        return []
      }
    })
    this.hostsStore.set('priorPeers', inUsePeerAddresses)
    await this.hostsStore.save()
  }
}
