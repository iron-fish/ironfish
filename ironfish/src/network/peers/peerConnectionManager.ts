/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createRootLogger, Logger } from '../../logger'
import type { Peer } from './peer'
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
 * PeerConnectionManager periodically determines whether to open new connections and/or
 * close existing connections on peers.
 */
export class PeerConnectionManager {
  private readonly logger: Logger
  private readonly peerManager: PeerManager
  readonly maxPeers: number

  private started = false
  private eventLoopTimer?: ReturnType<typeof setTimeout>

  constructor(
    peerManager: PeerManager,
    logger: Logger = createRootLogger(),
    options: {
      maxPeers: number
    },
  ) {
    this.peerManager = peerManager
    this.logger = logger.withTag('peerconnectionmanager')
    this.maxPeers = options.maxPeers
  }

  /**
   * Start the connection management event loop. Does nothing
   * if the event loop has already been started.
   */
  start(): void {
    if (this.started) return
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
    let connectAttempts = 0

    for (const peer of this.peerManager.peers) {
      this.maintainOneConnectionPerPeer(peer)

      if (this.connectToEligiblePeers(peer)) connectAttempts++
      if (connectAttempts >= CONNECT_ATTEMPTS_MAX) break

      if (this.attemptToEstablishWebRtcConnectionsToWSPeer(peer)) connectAttempts++
      if (connectAttempts >= CONNECT_ATTEMPTS_MAX) break
    }

    this.eventLoopTimer = setTimeout(() => this.eventLoop(), EVENT_LOOP_MS)
  }

  private connectToEligiblePeers(peer: Peer): boolean {
    if (peer.state.type !== 'CONNECTED') {
      if (this.peerManager.canConnectToWebRTC(peer)) {
        if (this.peerManager.connectToWebRTC(peer)) {
          return true
        }
      }

      if (this.peerManager.canConnectToWebSocket(peer)) {
        if (this.peerManager.connectToWebSocket(peer)) {
          return true
        }
      }
    }

    return false
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
      peer.state.connections.webSocket?.state.type === 'CONNECTED' &&
      this.peerManager.canConnectToWebRTC(peer)
    ) {
      return this.peerManager.connectToWebRTC(peer)
    }

    return false
  }
}
