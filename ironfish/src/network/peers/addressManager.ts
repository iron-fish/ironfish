/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { HostsStore, WebSocketCandidate } from '../../fileStores'
import { ArrayUtils } from '../../utils'
import { Peer } from '../peers/peer'
import { PeerAddress } from './peerAddress'
import { PeerManager } from './peerManager'

const MAX_WEBSOCKET_CANDIDATES = 25

/**
 * AddressManager stores the necessary data for connecting to new peers
 * and provides functionality for persistence of said data.
 */
export class AddressManager {
  hostsStore: HostsStore
  peerManager: PeerManager

  constructor(hostsStore: HostsStore, peerManager: PeerManager) {
    this.hostsStore = hostsStore
    this.peerManager = peerManager
  }

  get priorConnectedPeerAddresses(): ReadonlyArray<Readonly<PeerAddress>> {
    return this.hostsStore.getArray('priorPeers')
  }

  get webSocketCandidates(): ReadonlyArray<Readonly<PeerAddress>> {
    return this.hostsStore.getArray('wsCandidates')
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
  removePeerAddress(peer: Peer): void {
    const filteredPriorConnected = this.priorConnectedPeerAddresses.filter(
      (prior) => prior.identity !== peer.state.identity,
    )

    this.hostsStore.set('priorPeers', filteredPriorConnected)
  }

  webSocketCandidatesToSave(): WebSocketCandidate[] {
    const toSave: WebSocketCandidate[] = []
    for (const candidate of this.peerManager.peerCandidates.webSocketCandidates()) {
      if (toSave.length >= MAX_WEBSOCKET_CANDIDATES) {
        break
      }

      toSave.push({
        address: candidate.address,
        port: candidate.port,
        identity: candidate.identity,
        name: candidate.name,
        lastWebSocketConnectionTime: candidate.lastWebSocketConnectionTime,
      })
    }

    return toSave
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
    const wsCandidates = this.webSocketCandidatesToSave()

    this.hostsStore.set('priorPeers', inUsePeerAddresses)
    this.hostsStore.set('wsCandidates', wsCandidates)
    await this.hostsStore.save()
  }
}
