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
  priorPeersFromDisk: PeerAddress[] = []

  constructor(hostsStore: HostsStore, peerManager: PeerManager) {
    this.hostsStore = hostsStore
    this.peerManager = peerManager
    // load prior peers from disk
    this.priorPeersFromDisk = this.hostsStore.getArray('priorPeers')
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

  async addPeer(peer: Peer): Promise<void> {
    if (peer.state.type !== 'CONNECTED') {
      return
    }

    const addInfo = { webSocket: {}, webRtc: {} }
    if (peer.state.connections.webSocket) {
      addInfo.webSocket = {
        direction: peer.state.connections.webSocket.direction,
      }
    }
    if (peer.state.connections.webRtc) {
      addInfo.webRtc = {
        direction: peer.state.connections.webRtc.direction,
      }
    }

    this.priorPeersFromDisk.push({
      address: peer.address,
      port: peer.port,
      identity: peer.state.identity ?? null,
      name: peer.name ?? null,
      ...addInfo,
    })

    await this.hostsStore.save()
  }

  /**
   * Persist connected peers via outbound websocket connections to disk
   */
  async save(): Promise<void> {
    const inUsePeerAddresses: PeerAddress[] = this.peerManager.peers.flatMap((peer) => {
      if (peer.state.type === 'CONNECTED') {
        const addInfo = { webSocket: {}, webRtc: {} }
        if (peer.state.connections.webSocket) {
          addInfo.webSocket = {
            direction: peer.state.connections.webSocket.direction,
          }
        }
        if (peer.state.connections.webRtc) {
          addInfo.webRtc = {
            direction: peer.state.connections.webRtc.direction,
          }
        }

        return {
          address: peer.address,
          port: peer.port,
          identity: peer.state.identity ?? null,
          name: peer.name ?? null,
          ...addInfo,
        }
      } else {
        return []
      }
    })
    // append inUsePeerAddresses to priorPeersFromDisk
    // identity field is the ID

    const allPeers: PeerAddress[] = inUsePeerAddresses.concat(this.priorPeersFromDisk)

    // remove duplicates
    const uniquePeerIdentities = new Set<string>()
    const uniquePeers = allPeers.filter((peer) => {
      if (peer.identity === null) {
        return false
      }
      if (uniquePeerIdentities.has(peer.identity)) {
        return false
      } else {
        uniquePeerIdentities.add(peer.identity)
        return true
      }
    })

    await Promise.all([this.hostsStore.set('priorPeers', uniquePeers)])
  }
}
