/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PriorityQueue } from '../../utils'
import { ArrayUtils } from '../../utils/array'
import { Identity } from '../identity'
import { Peer as PeerListPeer } from '../messages/peerList'
import { ConnectionRetry } from './connectionRetry'
import { ConnectionDirection } from './connections'
import { Peer } from './peer'

export type PeerCandidate = {
  name: string | null
  address: string | null
  port: number | null
  neighbors: Set<Identity>
  webRtcRetry: ConnectionRetry
  websocketRetry: ConnectionRetry
  identity: Identity | null
  lastWebSocketConnectionTime: number | null
  /**
   * UTC timestamp. If set, the peer manager should not initiate connections to the
   * Peer until after the timestamp.
   */
  peerRequestedDisconnectUntil: number | null
  /**
   * UTC timestamp. If set, the peer manager should not accept connections from the
   * Peer until after the timestamp.
   */
  localRequestedDisconnectUntil: number | null
}

type CandidateId = string

type WebSocketPeer = {
  candidateId: CandidateId
  lastWebSocketConnectionTime: number | null
  address: string
  port: number
}

const webSocketCandidateComparator = (p1: WebSocketPeer, p2: WebSocketPeer): boolean => {
  if (p1.lastWebSocketConnectionTime === null) {
    return false
  }

  if (p2.lastWebSocketConnectionTime === null) {
    return true
  }

  return p1.lastWebSocketConnectionTime > p2.lastWebSocketConnectionTime
}

export class PeerCandidates {
  private readonly map: Map<CandidateId, PeerCandidate> = new Map()
  private readonly websocket: PriorityQueue<WebSocketPeer> = new PriorityQueue<WebSocketPeer>(
    webSocketCandidateComparator,
    (p) => p.candidateId,
  )

  get size(): number {
    return this.map.size
  }

  *webSocketCandidates(): Generator<PeerCandidate, void> {
    for (const { candidateId } of this.websocket.sorted()) {
      const peerCandidate = this.map.get(candidateId)
      if (peerCandidate) {
        yield peerCandidate
      }
    }
  }

  addFromPeer(peer: Peer, neighbors = new Set<Identity>()): void {
    const address = peer.getWebSocketAddress()
    const addressPeerCandidate = this.map.get(address)

    const currentWebSocketConnection =
      peer.state.type === 'CONNECTED' &&
      peer.state.connections.webSocket &&
      peer.state.connections.webSocket.direction === ConnectionDirection.Outbound

    const newPeerCandidate = {
      address: peer.address,
      port: peer.port,
      neighbors,
      webRtcRetry: new ConnectionRetry(peer.isWhitelisted),
      websocketRetry: new ConnectionRetry(peer.isWhitelisted),
      localRequestedDisconnectUntil: null,
      peerRequestedDisconnectUntil: null,
      ...addressPeerCandidate,
      name: peer.name,
      identity: peer.state.identity,
      lastWebSocketConnectionTime: currentWebSocketConnection ? Date.now() : null,
    }

    if (peer.state.identity !== null) {
      if (addressPeerCandidate) {
        this.delete(address)
      }

      this.add(peer.state.identity, newPeerCandidate)
    } else {
      this.add(address, newPeerCandidate)
    }
  }

  addFromPeerList(sendingPeerIdentity: Identity, peer: PeerListPeer): void {
    const peerIdentity = peer.identity.toString('base64')
    const peerCandidateValue = this.map.get(peerIdentity)

    if (peerCandidateValue) {
      peerCandidateValue.neighbors.add(sendingPeerIdentity)
    } else {
      const tempPeer = new Peer(peerIdentity)
      tempPeer.setWebSocketAddress(peer.address, peer.port)
      this.addFromPeer(tempPeer, new Set([sendingPeerIdentity]))
    }
  }

  shufflePeerCandidates(): string[] {
    return ArrayUtils.shuffle([...this.map.keys()])
  }

  get(candidateId: CandidateId): PeerCandidate | undefined {
    return this.map.get(candidateId)
  }

  has(candidateId: CandidateId): boolean {
    return this.map.has(candidateId)
  }

  private add(candidateId: CandidateId, value: PeerCandidate): void {
    if (!this.map.has(candidateId)) {
      this.map.set(candidateId, value)
      if (value.address && value.port) {
        this.websocket.add({
          candidateId,
          lastWebSocketConnectionTime: value.lastWebSocketConnectionTime,
          address: value.address,
          port: value.port,
        })
      }
    }
  }

  private delete(candidateId: CandidateId): void {
    this.websocket.remove(candidateId)
    this.map.delete(candidateId)
  }

  clear(): void {
    this.map.clear()
  }
}
