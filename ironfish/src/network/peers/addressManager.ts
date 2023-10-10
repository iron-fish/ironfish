/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { HostsStore } from '../../fileStores'
import { ArrayUtils } from '../../utils'
import { Peer } from '../peers/peer'
import { PeerAddress } from './peerAddress'
import { PeerManager } from './peerManager'

/**
 * AddressManager stores the necessary data for connecting to new peers
 * and provides functionality for persistence of said data.
 */
export class AddressManager {
  hostsStore: HostsStore
  peerManager: PeerManager
  startingPeerAddresses: PeerAddress[] = []

  constructor(hostsStore: HostsStore, peerManager: PeerManager) {
    this.hostsStore = hostsStore
    this.peerManager = peerManager
    this.startingPeerAddresses = this.hostsStore.getArray('priorPeers')
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

  private deduplicateAddresses(addresses: PeerAddress[]): PeerAddress[] {
    // do it by identity + address + port
    const dedupedAddresses: PeerAddress[] = []
    const seenIdentities = new Set<string>()

    for (const address of addresses) {
      if (address.identity === null) {
        continue
      }

      if (seenIdentities.has(address.identity)) {
        continue
      }

      seenIdentities.add(address.identity)
      dedupedAddresses.push(address)
    }

    return dedupedAddresses
  }

  /**
   * Persist all currently connected peers to disk
   */
  async save(): Promise<void> {
    // TODO: Ideally, we would like persist peers with whom we've
    // successfully established an outbound Websocket connection at
    // least once.
    const inUsePeerAddresses: PeerAddress[] = this.peerManager.peers.flatMap((peer) => {
      if (peer.state.type === 'CONNECTED') {
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
    const newPeers = this.deduplicateAddresses([
      ...this.startingPeerAddresses,
      ...inUsePeerAddresses,
    ])

    this.hostsStore.set('priorPeers', newPeers)
    await this.hostsStore.save()
  }
}
