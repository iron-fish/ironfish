/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { Peer } from './peer'
import { DEFAULT_KEEP_OPEN_PEER_SLOT } from '../../fileStores/config'
import { createRootLogger, Logger } from '../../logger'
import { ArrayUtils, SetTimeoutToken } from '../../utils'
import { DisconnectingReason } from '../messages/disconnecting'
import { PeerManager } from './peerManager'

/**
 * The time to wait after finishing the event loop before running the event loop again
 */
const EVENT_LOOP_MS = 2000

/**
 * The maximum number of connection attempts each eventloop tick
 */
const CONNECT_ATTEMPTS_MAX = 5

/**
 * The maximum number of connection upgrades each eventloop tick
 */
const UPGRADE_ATTEMPTS_MAX = 5

/**
 * PeerConnectionManager periodically determines whether to open new connections and/or
 * close existing connections on peers.
 */
export class PeerConnectionManager {
  private readonly logger: Logger
  private readonly peerManager: PeerManager
  readonly maxPeers: number
  readonly keepOpenPeerSlot: boolean

  private started = false
  private eventLoopTimer?: SetTimeoutToken

  constructor(
    peerManager: PeerManager,
    logger: Logger = createRootLogger(),
    options: {
      maxPeers: number
      keepOpenPeerSlot?: boolean
    },
  ) {
    this.peerManager = peerManager
    this.logger = logger.withTag('peerconnectionmanager')
    this.maxPeers = options.maxPeers
    this.keepOpenPeerSlot = options.keepOpenPeerSlot ?? DEFAULT_KEEP_OPEN_PEER_SLOT
  }

  /**
   * Start the connection management event loop. Does nothing
   * if the event loop has already been started.
   */
  start(): void {
    if (this.started) {
      return
    }
    this.started = true
    this.eventLoop()
  }

  /**
   * Stop the connection management event loop.
   */
  stop(): void {
    if (this.eventLoopTimer) {
      clearTimeout(this.eventLoopTimer)
    }
    this.started = false
  }

  private eventLoop() {
    let upgradeAttempts = 0
    for (const peer of this.peerManager.peers) {
      this.maintainOneConnectionPerPeer(peer)

      if (upgradeAttempts >= UPGRADE_ATTEMPTS_MAX) {
        continue
      }

      if (this.attemptToEstablishWebRtcConnectionsToWSPeer(peer)) {
        upgradeAttempts++
      }
    }

    this.attemptNewConnections()
    this.maintainMaxPeerCount()

    this.eventLoopTimer = setTimeout(() => this.eventLoop(), EVENT_LOOP_MS)
  }

  /**
   * Attempts to connect to a number of peer candidates if it is eligible to
   * create new connections
   */
  private attemptNewConnections(): void {
    if (!this.peerManager.canCreateNewConnections()) {
      return
    }

    let connectAttempts = 0

    for (const peerCandidateIdentity of this.peerManager.peerCandidates.shufflePeerCandidates()) {
      if (connectAttempts >= CONNECT_ATTEMPTS_MAX) {
        break
      }

      if (this.peerManager.identifiedPeers.has(peerCandidateIdentity)) {
        continue
      }

      const peerCandidate = this.peerManager.peerCandidates.get(peerCandidateIdentity)
      if (!peerCandidate) {
        continue
      }

      const peer = this.peerManager.getOrCreatePeer(peerCandidateIdentity)

      peer.name = peerCandidate.name
      peer.wsAddress = peerCandidate.wsAddress

      if (this.connectToEligiblePeers(peer)) {
        connectAttempts++
      } else {
        this.peerManager.tryDisposePeer(peer)
      }
    }
  }

  /**
   * Maintain a maximum number of peers by disconnecting from peers if we are
   * connected to more than we should be
   */
  private maintainMaxPeerCount(): void {
    const connectedPeers = this.peerManager.getConnectedPeers()
    const maxPeerCount = this.maxPeers - Number(this.keepOpenPeerSlot)

    if (connectedPeers.length <= maxPeerCount) {
      return
    }

    // Choose a random peer with some exceptions:
    // - Exclude the most recent peer connections as they are more likely to have fewer peers
    // - Exclude white-listed nodes
    const sampleEnd = Math.floor(connectedPeers.length * 0.8)
    const peersSlice = connectedPeers.slice(0, sampleEnd).filter((p) => !p.isWhitelisted)
    const peer = ArrayUtils.sample(peersSlice)
    if (!peer) {
      return
    }

    this.logger.debug(
      `Disconnecting from peer ${peer.displayName} since we are above our peer limit`,
    )

    this.peerManager.disconnect(
      peer,
      DisconnectingReason.Congested,
      this.peerManager.getCongestedDisconnectUntilTimestamp(),
    )
  }

  private connectToEligiblePeers(peer: Peer): boolean {
    if (peer.state.type === 'CONNECTED') {
      return false
    }

    if (this.peerManager.connectToWebRTC(peer)) {
      return true
    }

    return this.peerManager.connectToWebSocket(peer)
  }

  /**
   * If we've successfully established both a WebSocket connection and a WebRTC
   * connection, close the WebSocket connection
   */
  private maintainOneConnectionPerPeer(peer: Peer) {
    if (
      peer.state.type === 'CONNECTED' &&
      peer.state.connections.webRtc?.state.type === 'CONNECTED' &&
      peer.state.connections.webSocket?.state.type === 'CONNECTED'
    ) {
      this.logger.debug(
        `Upgraded ${peer.displayName} to WebRTC, closing the WebSocket connection`,
      )
      peer.state.connections.webSocket.close()
    }
  }

  /**
   * If we've successfully established a WebSocket connection,
   * attempt to establish a WebRTC connection
   */
  private attemptToEstablishWebRtcConnectionsToWSPeer(peer: Peer): boolean {
    if (
      peer.state.type === 'CONNECTED' &&
      peer.state.connections.webSocket?.state.type === 'CONNECTED'
    ) {
      return this.peerManager.connectToWebRTC(peer)
    }

    return false
  }
}
