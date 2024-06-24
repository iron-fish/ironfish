/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { SignalData } from './connections/webRtcConnection'
import { Event } from '../../event'
import { DEFAULT_MAX_PEERS, DEFAULT_TARGET_PEERS } from '../../fileStores'
import { PeerStore } from '../../fileStores/peerStore'
import { createRootLogger, Logger } from '../../logger'
import { MetricsMonitor } from '../../metrics'
import { ArrayUtils, SetIntervalToken } from '../../utils'
import {
  canInitiateWebRTC,
  canKeepDuplicateConnection,
  Identity,
  isIdentity,
} from '../identity'
import { DisconnectingMessage, DisconnectingReason } from '../messages/disconnecting'
import { IdentifyMessage } from '../messages/identify'
import { NetworkMessage } from '../messages/networkMessage'
import { PeerListMessage } from '../messages/peerList'
import { PeerListRequestMessage } from '../messages/peerListRequest'
import { SignalMessage } from '../messages/signal'
import { SignalRequestMessage } from '../messages/signalRequest'
import { IsomorphicWebSocket } from '../types'
import { formatWebSocketAddress, WebSocketAddress } from '../utils'
import { VERSION_PROTOCOL_MIN } from '../version'
import { ConnectionRetry } from './connectionRetry'
import {
  Connection,
  ConnectionDirection,
  ConnectionType,
  NetworkError,
  WebRtcConnection,
  WebSocketConnection,
} from './connections'
import { LocalPeer } from './localPeer'
import { Peer } from './peer'
import { PeerCandidates } from './peerCandidates'
import { PeerStoreManager } from './peerStoreManager'

/**
 * The maximum number of attempts the client will make to find a brokering peer
 * that can send signaling messages to another peer.
 */
const MAX_WEBRTC_BROKERING_ATTEMPTS = 5

/**
 * PeerManager keeps the state of Peers and their underlying connections up to date,
 * determines how to establish a connection to a given Peer, and provides an event
 * bus for Peers, e.g. for listening to incoming messages from all connected peers.
 */
export class PeerManager {
  private readonly logger: Logger
  private readonly metrics: MetricsMonitor

  /**
   * Stores data related to the user's peer, like the identity and version
   */
  public readonly localPeer: LocalPeer

  /**
   * Map of identities to peers for every known identified peer in the network.
   */
  readonly identifiedPeers: Map<Identity, Peer> = new Map<Identity, Peer>()

  // Mapping of peer identity with reason they were banned
  readonly banned = new Map<Identity, string>()

  /**
   * List of all peers, including both unidentified and identified.
   */
  peers: Array<Peer> = []

  peerCandidates: PeerCandidates = new PeerCandidates()

  peerStoreManager: PeerStoreManager

  /**
   * setInterval handle for requestPeerList, which sends out peer lists and
   * requests for peer lists
   */
  private requestPeerListHandle: SetIntervalToken | undefined

  /**
   * STUN servers to use for inititating WebRTC connections.
   */
  private stunServers: string[]

  /**
   * setInterval handle for peer disposal, which removes peers from the list that we
   * no longer care about
   */
  private disposePeersHandle: SetIntervalToken | undefined

  /**
   * setInterval handle for peer address persistence, which saves connected
   * peers to disk
   */
  private savePeerAddressesHandle: SetIntervalToken | undefined

  /**
   * Event fired when a new connection is successfully opened. Sends some identifying
   * information about the peer.
   *
   * This event is fired regardless of whether or not we initiated the connection.
   */
  readonly onConnect: Event<[Peer]> = new Event()

  /**
   * Event fired when an identified peer is disconnected for some reason.
   */
  readonly onDisconnect: Event<[Peer]> = new Event()

  /**
   * Event fired for every new incoming message that needs to be processed
   * by the application layer.
   *
   * Note that the `Peer` is the peer that sent it to us,
   * not necessarily the original source.
   */
  readonly onMessage: Event<[Peer, NetworkMessage]> = new Event()

  /**
   * Event fired when a peer enters or leaves the CONNECTED state.
   */
  readonly onConnectedPeersChanged: Event<[]> = new Event()

  /**
   * The maximum number of peers allowed to be in the CONNECTED or CONNECTING state.
   */
  readonly maxPeers: number

  /**
   * Stops establishing connections to DISCONNECTED peers when at or above this number.
   */
  readonly targetPeers: number

  /**
   * If true, track all sent and received network messages per-peer.
   */
  readonly logPeerMessages: boolean

  constructor(
    localPeer: LocalPeer,
    peerStore: PeerStore,
    logger: Logger = createRootLogger(),
    metrics?: MetricsMonitor,
    maxPeers = DEFAULT_MAX_PEERS,
    targetPeers = DEFAULT_TARGET_PEERS,
    logPeerMessages = false,
    stunServers: string[] = [],
  ) {
    this.stunServers = stunServers
    this.logger = logger.withTag('peermanager')
    this.metrics = metrics || new MetricsMonitor({ logger: this.logger })
    this.localPeer = localPeer
    this.maxPeers = maxPeers
    this.targetPeers = Math.min(targetPeers, maxPeers)
    this.logPeerMessages = logPeerMessages
    this.peerStoreManager = new PeerStoreManager(peerStore)
  }

  start(): void {
    this.requestPeerListHandle = setInterval(() => this.requestPeerList(), 60000)
    this.disposePeersHandle = setInterval(() => this.disposePeers(), 2000)
  }

  /**
   * Call when shutting down the PeerManager to clean up
   * outstanding connections.
   */
  async stop(): Promise<void> {
    this.requestPeerListHandle && clearInterval(this.requestPeerListHandle)
    this.disposePeersHandle && clearInterval(this.disposePeersHandle)
    this.savePeerAddressesHandle && clearInterval(this.savePeerAddressesHandle)
    await this.peerStoreManager.save()
    for (const peer of this.peers) {
      this.disconnect(peer, DisconnectingReason.ShuttingDown, 0)
    }
  }

  /**
   * Connect to a websocket by its uri. Establish a connection and solicit
   * the server's Identity.
   */
  connectToWebSocketAddress(options: {
    host: string
    port: number
    whitelist?: boolean
    forceConnect?: boolean
  }): Peer | undefined {
    const peer = this.getOrCreatePeer(null)
    peer.wsAddress = { host: options.host, port: options.port }
    peer.isWhitelisted = !!options.whitelist

    this.peerCandidates.addFromPeer(peer)

    if (this.connectToWebSocket(peer, !!options.forceConnect)) {
      return peer
    }
  }

  /**
   * Connect to a peer using WebSockets
   * */
  connectToWebSocket(peer: Peer, forceConnect = false): boolean {
    if (!this.canConnectToWebSocket(peer, forceConnect)) {
      return false
    }

    const address = formatWebSocketAddress(peer.wsAddress)
    const alternateIdentity = peer.state.identity ?? address

    const candidate = alternateIdentity ? this.peerCandidates.get(alternateIdentity) : undefined
    if (candidate) {
      // If we're trying to connect to the peer, we don't care about limiting the peer's connections to us
      candidate.localRequestedDisconnectUntil = null

      // Clear out peerRequestedDisconnect if we passed it
      candidate.peerRequestedDisconnectUntil = null
    }

    if (!address) {
      candidate?.websocketRetry.failedConnection()
      return false
    }

    this.initWebSocketConnection(
      peer,
      new this.localPeer.webSocket(address),
      ConnectionDirection.Outbound,
      peer.wsAddress,
    )

    return true
  }

  /**
   * Connect to a peer using WebRTC through another peer
   * */
  connectToWebRTC(peer: Peer): boolean {
    if (!this.canConnectToWebRTC(peer)) {
      return false
    }

    if (peer.state.identity === null) {
      return false
    }

    const candidate = this.peerCandidates.get(peer.state.identity)
    if (candidate) {
      // If we're trying to connect to the peer, we don't care about limiting the peer's connections to us
      candidate.localRequestedDisconnectUntil = null

      // Clear out peerRequestedDisconnect if we passed it
      candidate.peerRequestedDisconnectUntil = null
    }

    // Make sure we can find at least one brokering peer before we create the connection
    const hasBrokeringPeers = this.hasBrokeringPeers(peer)

    if (!hasBrokeringPeers) {
      this.logger.debug(
        `Attempted to establish a WebRTC connection to ${peer.displayName}, but couldn't find a peer to broker the connection.`,
      )

      this.getConnectionRetry(
        peer.state.identity,
        ConnectionType.WebRtc,
        ConnectionDirection.Outbound,
      )?.failedConnection()

      return false
    }

    if (canInitiateWebRTC(this.localPeer.publicIdentity, peer.state.identity)) {
      this.initWebRtcConnection(peer, true)
      return true
    }

    const signal = new SignalRequestMessage({
      sourceIdentity: this.localPeer.publicIdentity,
      destinationIdentity: peer.state.identity,
    })

    const connection = this.initWebRtcConnection(peer, false)
    connection.setState({ type: 'REQUEST_SIGNALING' })

    const brokeringPeers = this.getBrokeringPeers(peer)

    if (brokeringPeers.length === 0) {
      return false
    }

    const brokeringPeer = brokeringPeers[0]
    brokeringPeer.send(signal)

    return true
  }

  createPeerFromInboundWebSocketConnection(
    webSocket: IsomorphicWebSocket,
    wsAddress: WebSocketAddress | null,
  ): Peer {
    const peer = this.getOrCreatePeer(null)

    this.initWebSocketConnection(peer, webSocket, ConnectionDirection.Inbound, wsAddress)

    return peer
  }

  /**
   * Perform WebSocket-specific connection setup.
   */
  private initWebSocketConnection(
    peer: Peer,
    ws: IsomorphicWebSocket,
    direction: ConnectionDirection,
    wsAddress: WebSocketAddress | null,
  ): WebSocketConnection {
    const connection = new WebSocketConnection(
      ws,
      direction,
      this.logger,
      this.metrics,
      wsAddress,
    )

    this.initConnectionHandlers(peer, connection)
    peer.setWebSocketConnection(connection)

    return connection
  }

  /**
   * Perform WebRTC-specific connection setup
   * @param peer The peer to establish a connection with
   * @param initiator Set to true if we are initiating a connection with `peer`
   */
  private initWebRtcConnection(peer: Peer, initiator: boolean): WebRtcConnection {
    const connection = new WebRtcConnection(initiator, this.logger, this.metrics, {
      stunServers: this.stunServers,
    })

    connection.onSignal.on((data) => {
      let errorMessage
      if (peer.state.identity === null) {
        errorMessage = 'Cannot establish a WebRTC connection without a peer identity'
      }

      // Ensure one or more brokering peers exists before encrypting the signaling message,
      // but discard the brokering peer in case its state changes during encryption

      const hasBrokeringPeers = this.hasBrokeringPeers(peer)

      if (!hasBrokeringPeers) {
        errorMessage = 'Cannot establish a WebRTC connection without a brokering peer'
      }

      if (errorMessage !== undefined) {
        this.logger.debug(errorMessage)
        connection.close(new NetworkError(errorMessage))
        return
      }

      // Create the message only once, since this is a time-consuming operation
      const { nonce, boxedMessage } = this.localPeer.boxMessage(
        JSON.stringify(data),
        peer.getIdentityOrThrow(),
      )

      const brokeringPeers = this.getBrokeringPeers(peer)
      const limitedBrokeringPeers = brokeringPeers.slice(0, MAX_WEBRTC_BROKERING_ATTEMPTS)

      for (const brokeringPeer of limitedBrokeringPeers) {
        if (brokeringPeer === null) {
          const message = 'Cannot establish a WebRTC connection without a brokering peer'
          this.logger.debug(message)
          connection.close(new NetworkError(message))
          return
        }

        const signal = new SignalMessage({
          sourceIdentity: this.localPeer.publicIdentity,
          destinationIdentity: peer.getIdentityOrThrow(),
          nonce: nonce,
          signal: boxedMessage,
        })

        // If sending the message failed, try again (the brokeringPeer's state may have changed)
        const sendResult = brokeringPeer.send(signal)

        if (sendResult !== null) {
          brokeringPeer.pushLoggedMessage(
            {
              direction: 'send',
              message: signal,
              timestamp: Date.now(),
              type: sendResult.type,
            },
            true,
          )

          if (brokeringPeer !== peer) {
            peer.pushLoggedMessage(
              {
                direction: 'send',
                brokeringPeerDisplayName: brokeringPeer.displayName,
                message: signal,
                timestamp: Date.now(),
                type: sendResult.type,
              },
              true,
            )
          }

          return
        }
      }

      const message = `Failed to find a brokering peer after ${MAX_WEBRTC_BROKERING_ATTEMPTS} attempts`
      this.logger.debug(message)
      connection.close(new NetworkError(message))
    })

    this.initConnectionHandlers(peer, connection)
    peer.setWebRtcConnection(connection)

    return connection
  }

  /**
   * Set up event handlers that are common among all connection types.
   * @param connection An instance of a Connection.
   */
  private initConnectionHandlers(peer: Peer, connection: Connection) {
    if (connection.state.type === 'WAITING_FOR_IDENTITY') {
      connection.send(this.localPeer.getIdentifyMessage())
    } else if (connection.state.type === 'CONNECTED') {
      this.getConnectionRetry(
        connection.state.identity,
        connection.type,
        connection.direction,
      )?.successfulConnection()
    }

    const handler = () => {
      if (connection.state.type === 'WAITING_FOR_IDENTITY') {
        connection.send(this.localPeer.getIdentifyMessage())
        connection.onStateChanged.off(handler)
      } else if (
        connection.state.type === 'DISCONNECTED' &&
        connection.error !== null &&
        peer.state.identity !== null
      ) {
        this.getConnectionRetry(
          peer.state.identity,
          connection.type,
          connection.direction,
        )?.failedConnection()
      } else if (connection.state.type === 'CONNECTED') {
        this.getConnectionRetry(
          connection.state.identity,
          connection.type,
          connection.direction,
        )?.successfulConnection()
      }
    }
    connection.onStateChanged.on(handler)
  }

  canConnectToWebSocket(peer: Peer, forceConnect = false): boolean {
    const isBanned = this.isBanned(peer)

    const alternateIdentity = peer.state.identity ?? formatWebSocketAddress(peer.wsAddress)
    const candidate = alternateIdentity ? this.peerCandidates.get(alternateIdentity) : undefined

    const canEstablishNewConnection =
      peer.state.type !== 'DISCONNECTED' || this.canCreateNewConnections()

    const peerRequestedDisconnectUntil = candidate?.peerRequestedDisconnectUntil ?? null

    const disconnectOk =
      peerRequestedDisconnectUntil === null || Date.now() >= peerRequestedDisconnectUntil

    const hasNoConnection =
      peer.state.type === 'DISCONNECTED' || peer.state.connections.webSocket === null

    const retryOk = candidate?.websocketRetry.canConnect ?? true

    if (forceConnect) {
      return disconnectOk && !isBanned
    }

    return (
      !isBanned &&
      canEstablishNewConnection &&
      disconnectOk &&
      hasNoConnection &&
      retryOk &&
      peer.wsAddress !== null
    )
  }

  canConnectToWebRTC(peer: Peer, now = Date.now()): boolean {
    if (this.isBanned(peer)) {
      return false
    }

    if (peer.state.identity === null) {
      return false
    }

    const canEstablishNewConnection =
      peer.state.type !== 'DISCONNECTED' || this.canCreateNewConnections()

    const peerRequestedDisconnectUntil =
      this.peerCandidates.get(peer.state.identity)?.peerRequestedDisconnectUntil ?? null

    const disconnectOk =
      peerRequestedDisconnectUntil === null || now >= peerRequestedDisconnectUntil

    const hasNoConnection =
      peer.state.type === 'DISCONNECTED' || peer.state.connections.webRtc === undefined

    const retryOk =
      this.getConnectionRetry(
        peer.state.identity,
        ConnectionType.WebRtc,
        ConnectionDirection.Outbound,
      )?.canConnect ?? true

    return canEstablishNewConnection && disconnectOk && hasNoConnection && retryOk
  }

  /**
   * Generate a timestamp for use in disconnect messages when the peer has more
   * connected peers than maxPeers.
   */
  getCongestedDisconnectUntilTimestamp(): number {
    return Date.now() + 1000 * 60 * 5
  }

  /**
   * Initiate a disconnection from another peer.
   * @param peer The peer to disconnect from
   * @param reason The reason for disconnecting from the peer
   * @param until Stay disconnected from the peer until after this timestamp
   */
  disconnect(peer: Peer, reason: DisconnectingReason, until: number): void {
    if (peer.state.identity) {
      const candidate = this.peerCandidates.get(peer.state.identity)
      if (candidate) {
        candidate.localRequestedDisconnectUntil = until
      }
    }

    if (peer.state.type === 'DISCONNECTED') {
      return
    }

    const message = new DisconnectingMessage({
      sourceIdentity: this.localPeer.publicIdentity,
      destinationIdentity: peer.state.identity,
      reason,
      disconnectUntil: until,
    })

    const canSend = (connection: Connection): boolean => {
      return (
        connection.state.type === 'WAITING_FOR_IDENTITY' ||
        connection.state.type === 'CONNECTED'
      )
    }

    if (peer.state.connections.webRtc && canSend(peer.state.connections.webRtc)) {
      peer.state.connections.webRtc.send(message)
    }

    if (peer.state.connections.webSocket && canSend(peer.state.connections.webSocket)) {
      peer.state.connections.webSocket.send(message)
    }

    peer.close()
  }

  getConnectedPeers(): ReadonlyArray<Peer> {
    return [...this.identifiedPeers.values()].filter((p) => {
      return p.state.type === 'CONNECTED'
    })
  }

  /**
   * Returns true if the total number of connected peers is less
   * than the target amount of peers
   */
  canCreateNewConnections(): boolean {
    return this.getConnectedPeers().length < this.targetPeers
  }

  /**
   * True if we should reject connections from disconnected Peers.
   */
  shouldRejectDisconnectedPeers(): boolean {
    return this.getConnectedPeers().length >= this.maxPeers
  }

  private hasBrokeringPeers(peer: Peer): boolean {
    if (peer.state.type === 'CONNECTED') {
      return true
    }

    if (peer.state.identity === null || !this.peerCandidates.has(peer.state.identity)) {
      return false
    }

    const peerCandidate = this.peerCandidates.get(peer.state.identity)

    if (!peerCandidate) {
      return false
    }

    for (const neighbor of peerCandidate.neighbors) {
      const neighborPeer = this.identifiedPeers.get(neighbor)

      if (neighborPeer && neighborPeer.state.type === 'CONNECTED') {
        return true
      }
    }

    return false
  }

  /** For a given peer, try to find a peer that's connected to that peer
   * including itself to broker a WebRTC connection to it
   * */
  private getBrokeringPeers(peer: Peer): Peer[] {
    if (peer.state.type === 'CONNECTED') {
      // Use the existing connection to the peer to broker the connection
      return [peer]
    }

    if (peer.state.identity === null) {
      // Cannot find a brokering peer of an unidentified peer
      return []
    }

    // The peer candidate map tracks any brokering peer candidates
    const peerCandidate = this.peerCandidates.get(peer.state.identity)
    if (!peerCandidate) {
      return []
    }

    // Find another peer to broker the connection
    const candidates = []

    for (const neighbor of peerCandidate.neighbors) {
      const neighborPeer = this.identifiedPeers.get(neighbor)

      if (neighborPeer && neighborPeer.state.type === 'CONNECTED') {
        candidates.push(neighborPeer)
      } else {
        peerCandidate.neighbors.delete(neighbor)
      }
    }

    return ArrayUtils.shuffle(candidates)
  }

  /**
   * This function puts a peer in the identified peers map and should be called once
   * a peer is connected, meaning it has a connection that has received an identity
   */
  private updateIdentifiedPeerMap(peer: Peer): void {
    if (peer.state.identity === null) {
      this.logger.warn('updateIdentifiedPeerMap called with a Peer with null identity')
      return
    }

    // If we don't have a Peer in the Map for this identity, set it and be done
    const existingPeer = this.identifiedPeers.get(peer.state.identity)
    if (!existingPeer || peer === existingPeer) {
      this.identifiedPeers.set(peer.state.identity, peer)
      return
    }

    // Merge the connections from the new peer onto the existing peer. We want to keep
    // the existing peer since someone may be holding a reference
    if (peer.state.type === 'DISCONNECTED') {
      this.logger.debug(`Trying to dispose disconnected peer ${peer.displayName}`)
      peer.close()
      this.tryDisposePeer(peer)
      return
    }

    if (peer.state.connections.webRtc?.state.type === 'CONNECTED') {
      existingPeer.replaceWebRtcConnection(peer.state.connections.webRtc)
      peer.removeConnection(peer.state.connections.webRtc)
    }

    if (peer.state.connections.webSocket?.state.type === 'CONNECTED') {
      existingPeer.replaceWebSocketConnection(peer.state.connections.webSocket)
      peer.removeConnection(peer.state.connections.webSocket)
    }

    this.tryDisposePeer(peer)
  }

  /**
   * Given an identity, returns the Peer corresponding to that identity,
   * or null if no Peer for that identity exists.
   * @param identity A peer identity.
   */
  getPeer(identity: Identity): Peer | null {
    return this.identifiedPeers.get(identity) || null
  }

  /**
   * If a null identity is passed, creates a new Peer. If an identity is passed, returns the Peer
   * if we already have one with that identity, else creates a new Peer with that identity.
   * @param identity The identity of the peer to create, or null if the peer does not yet have one.
   */
  getOrCreatePeer(identity: Identity | null): Peer {
    // If we already have a Peer with this identity, return it
    if (identity !== null) {
      const identifiedPeer = this.identifiedPeers.get(identity)
      if (identifiedPeer) {
        return identifiedPeer
      }
    }

    // Create the new peer
    const peer = new Peer(identity, {
      logger: this.logger,
      shouldLogMessages: this.logPeerMessages,
      metrics: this.metrics,
    })

    // Add the peer to peers. It's new, so it shouldn't exist there already
    this.peers.push(peer)

    // If the peer hasn't been identified, add it to identifiedPeers when the
    // peer connects, else do it now
    if (peer.state.identity === null) {
      const handler = () => {
        if (peer.state.type === 'CONNECTED') {
          this.updateIdentifiedPeerMap(peer)
          peer.onStateChanged.off(handler)
        }
      }
      peer.onStateChanged.on(handler)
    } else {
      this.updateIdentifiedPeerMap(peer)
    }

    // Bind Peer events to PeerManager events
    peer.onMessage.on((message, connection) => {
      this.handleMessage(peer, connection, message)
    })

    peer.onStateChanged.on(({ prevState }) => {
      if (prevState.type !== 'CONNECTED' && peer.state.type === 'CONNECTED') {
        void this.peerStoreManager.addPeer(peer)
        this.peerCandidates.addFromPeer(peer)
        this.onConnect.emit(peer)
        this.onConnectedPeersChanged.emit()
        peer.send(new PeerListRequestMessage())
      }
      if (prevState.type === 'CONNECTED' && peer.state.type !== 'CONNECTED') {
        this.onDisconnect.emit(peer)
        this.onConnectedPeersChanged.emit()
      }
      if (prevState.type !== 'DISCONNECTED' && peer.state.type === 'DISCONNECTED') {
        this.tryDisposePeer(peer)
      }
    })

    peer.onBanned.on((reason) => {
      void this.peerStoreManager.removePeer(peer)
      this.banPeer(peer, reason)
    })

    return peer
  }

  banPeer(peer: Peer, reason: string): void {
    const identity = peer.state.identity

    if (identity) {
      this.banned.set(identity, reason)
    }

    peer.close()
  }

  isBanned(peer: Peer): boolean {
    return !!peer.state.identity && this.banned.has(peer.state.identity)
  }

  private requestPeerList() {
    const peerListRequest = new PeerListRequestMessage()

    for (const peer of this.getConnectedPeers()) {
      peer.send(peerListRequest)
    }
  }

  private disposePeers(): void {
    for (const p of this.peers) {
      this.tryDisposePeer(p)
    }
  }

  /**
   * Returns true if we successfully cleaned up the Peer and removed it from PeerManager,
   * else returns false and does nothing.
   * @param peer The peer to evaluate
   */
  tryDisposePeer(peer: Peer): boolean {
    if (peer.state.type !== 'DISCONNECTED') {
      return false
    }

    peer.dispose()

    if (peer.state.identity && this.identifiedPeers.get(peer.state.identity) === peer) {
      this.identifiedPeers.delete(peer.state.identity)
    }
    this.peers = this.peers.filter((p) => p !== peer)

    return true
  }

  getConnectionRetry(
    identity: string,
    type: ConnectionType,
    direction: ConnectionDirection,
  ): ConnectionRetry | null {
    if (direction !== ConnectionDirection.Outbound) {
      return null
    }

    const candidate = this.peerCandidates.get(identity)

    if (!candidate) {
      return null
    }

    return type === ConnectionType.WebRtc ? candidate.webRtcRetry : candidate.websocketRetry
  }

  /**
   * Handler fired whenever we receive any message from a peer.
   */
  private handleMessage(peer: Peer, connection: Connection, message: NetworkMessage) {
    if (connection.state.type === 'WAITING_FOR_IDENTITY') {
      this.handleMessageInWaitingForIdentityState(peer, connection, message)
    } else if (message instanceof IdentifyMessage) {
      this.handleIdentifyMessage(peer, connection, message)
    } else if (message instanceof DisconnectingMessage) {
      this.handleDisconnectingMessage(peer, connection, message)
    } else if (message instanceof SignalMessage) {
      this.handleSignalMessage(peer, connection, message)
    } else if (message instanceof SignalRequestMessage) {
      this.handleSignalRequestMessage(peer, connection, message)
    } else if (message instanceof PeerListMessage) {
      this.handlePeerListMessage(message, peer)
    } else if (message instanceof PeerListRequestMessage) {
      this.handlePeerListRequestMessage(peer)
    } else {
      if (peer.state.identity === null) {
        this.logger.debug(
          `Closing connection to unidentified peer that sent an unexpected message: ${message.displayType()}`,
        )
        peer.close()
        return
      }
      this.onMessage.emit(peer, message)
    }
  }

  private handleIdentifyMessage(
    peer: Peer,
    connection: Connection,
    message: IdentifyMessage,
  ): void {
    this.logger.debug(
      `Closing connection to ${peer.displayName} that sent identity ${message.identity} while connection is in state ${connection.state.type}`,
    )
    peer.close()
  }

  private handleDisconnectingMessage(
    messageSender: Peer,
    connection: Connection,
    message: DisconnectingMessage,
  ) {
    if (
      message.destinationIdentity !== this.localPeer.publicIdentity &&
      message.destinationIdentity !== null
    ) {
      // Only forward it if the message was received from the same peer as it originated from
      if (message.sourceIdentity !== messageSender.state.identity) {
        this.logger.debug(
          `not forwarding disconnect from ${
            messageSender.displayName
          } because the message's source identity (${
            message.sourceIdentity
          }) doesn't match the sender's identity (${String(messageSender.state.identity)})`,
        )
        return
      }

      const destinationPeer = this.getPeer(message.destinationIdentity)

      if (!destinationPeer) {
        this.logger.debug(
          `not forwarding disconnect from ${messageSender.displayName} due to unknown peer ${message.destinationIdentity}`,
        )
        return
      }

      destinationPeer.send(message)
      return
    }

    let disconnectingPeer
    if (messageSender.state.identity === null) {
      // If the message sender has no identity yet, assume they requested the disconnect, since
      // they shouldn't be forwarding messages for other peers before our state is CONNECTED.
      disconnectingPeer = messageSender
    } else {
      // Otherwise, the sourceIdentity on the message requested the disconnect.
      disconnectingPeer = this.getPeer(message.sourceIdentity)
      if (!disconnectingPeer) {
        this.logger.debug(
          `Received disconnect request from ${message.sourceIdentity} but have no peer with that identity`,
        )
        return
      }
    }

    if (disconnectingPeer !== messageSender) {
      disconnectingPeer.pushLoggedMessage({
        brokeringPeerDisplayName: messageSender.displayName,
        timestamp: Date.now(),
        direction: 'receive',
        message: message,
        type: connection.type,
      })
    }

    if (disconnectingPeer.state.identity) {
      const candidate = this.peerCandidates.get(disconnectingPeer.state.identity)
      if (candidate) {
        candidate.peerRequestedDisconnectUntil = message.disconnectUntil
      }
    }
    this.logger.debug(
      `${disconnectingPeer.displayName} requested we disconnect until ${
        message.disconnectUntil
      }. Current time is ${Date.now()}`,
    )
    disconnectingPeer.close()
  }

  /**
   * Handle messages received when the peer is in the WAITING_FOR_IDENTITY state.
   *
   * @param message The message received.
   * @param peer The Peer the message was received from.
   * @param connection The Connection the message was received from.
   */
  private handleMessageInWaitingForIdentityState(
    peer: Peer,
    connection: Connection,
    message: NetworkMessage,
  ): void {
    // If we receive any message other than an Identity message, close the connection
    if (!(message instanceof IdentifyMessage)) {
      this.logger.debug(
        `Disconnecting from ${
          peer.displayName
        } - Sent unexpected message ${message.displayType()} while waiting for identity`,
      )
      peer.close()
      return
    }

    let error: string | null = null
    if (!isIdentity(message.identity)) {
      error = `Identity ${message.identity} does not match expected format`
    } else if (message.version < VERSION_PROTOCOL_MIN) {
      error = `Peer version ${message.version} is not compatible with our minimum: ${VERSION_PROTOCOL_MIN}`
    } else if (message.networkId !== this.localPeer.networkId) {
      error = `Peer is on network ${message.networkId} while we are on network ${this.localPeer.networkId}`
    } else if (!message.genesisBlockHash.equals(this.localPeer.chain.genesis.hash)) {
      error = 'Peer is using a different genesis block'
    } else if (message.name && message.name.length > 32) {
      error = `Peer name length exceeds 32: ${message.name.length}`
    }

    if (error) {
      this.logger.debug(`Disconnecting from ${message.identity} - ${error}`)
      this.getConnectionRetry(
        message.identity,
        connection.type,
        connection.direction,
      )?.failedConnection()
      peer.close(new Error(error))
      return
    }

    if (this.banned.has(message.identity)) {
      this.getConnectionRetry(
        message.identity,
        connection.type,
        connection.direction,
      )?.neverRetryConnecting()
      peer.close(new Error('banned'))
      return
    }

    // If we've connected to ourselves, get rid of the connection and take the address and port off the Peer.
    // This can happen if a node stops and starts with a different identity
    if (message.identity === this.localPeer.publicIdentity) {
      peer.removeConnection(connection)
      this.getConnectionRetry(
        message.identity,
        connection.type,
        connection.direction,
      )?.neverRetryConnecting()

      if (
        connection.type === ConnectionType.WebSocket &&
        connection.direction === ConnectionDirection.Outbound
      ) {
        peer.wsAddress = null
      }

      const error = `Closing ${connection.type} connection from our own identity`
      this.logger.debug(error)
      connection.close(new NetworkError(error))
      this.tryDisposePeer(peer)
      return
    }

    // If we already know the peer's identity and the new identity doesn't match, move the connection
    // to a Peer with the new identity.
    if (peer.state.identity !== null && peer.state.identity !== message.identity) {
      this.logger.debug(
        `${peer.displayName} sent identity ${message.identity}, but already has identity ${peer.state.identity}`,
      )

      peer.removeConnection(connection)
      this.getConnectionRetry(
        message.identity,
        connection.type,
        connection.direction,
      )?.neverRetryConnecting()

      const originalPeer = peer
      peer = this.getOrCreatePeer(message.identity)

      if (connection instanceof WebRtcConnection) {
        peer.setWebRtcConnection(connection)
      } else if (connection instanceof WebSocketConnection) {
        if (
          connection.type === ConnectionType.WebSocket &&
          connection.direction === ConnectionDirection.Outbound &&
          originalPeer.wsAddress !== null
        ) {
          peer.wsAddress = originalPeer.wsAddress
          const candidate = this.peerCandidates.get(message.identity)
          if (candidate) {
            candidate.wsAddress = originalPeer.wsAddress
            // Reset ConnectionRetry since some component of the address changed
            candidate.websocketRetry.successfulConnection()
          }
          originalPeer.wsAddress = null
        }
        peer.setWebSocketConnection(connection)
      }
    }

    const existingPeer = this.getPeer(message.identity)

    // Check if already have a duplicate websocket connection from this peer
    //
    // This probably happened because either we connected to each other at the same time,
    // or the other side is trying to establish multiple connections to us which is invalid
    // behaviour. We should kill the peer / connection that was initiated by the peer with
    // the lower identity
    if (
      existingPeer !== null &&
      existingPeer.state.type === 'CONNECTED' &&
      existingPeer.state.connections.webSocket &&
      connection.type === ConnectionType.WebSocket
    ) {
      const existingConnection = existingPeer.state.connections.webSocket
      let connectionToClose = connection

      // We keep the other persons outbound connection
      if (canKeepDuplicateConnection(message.identity, this.localPeer.publicIdentity)) {
        if (connection.direction === ConnectionDirection.Outbound) {
          connectionToClose = connection
        } else if (existingConnection.direction === ConnectionDirection.Outbound) {
          connectionToClose = existingConnection
        }
      }

      // We keep our outbound connection
      if (canKeepDuplicateConnection(this.localPeer.publicIdentity, message.identity)) {
        if (connection.direction === ConnectionDirection.Inbound) {
          connectionToClose = connection
        } else if (existingConnection.direction === ConnectionDirection.Inbound) {
          connectionToClose = existingConnection
        }
      }

      const error = `Closing duplicate ${connectionToClose.type} connection with direction ${connectionToClose.direction}`
      this.logger.debug(error)
      connectionToClose.close(new NetworkError(error))

      if (connectionToClose === connection) {
        return
      }
    }

    // Inbound WebSocket connections come with an address but no port, so we need to
    // pull the port from the identity message onto the connection. In cases where we
    // attempt to establish an outbound WebSocket connection, we should have received
    // the port via the peer list or user input, so we can ignore it.
    if (
      connection instanceof WebSocketConnection &&
      connection.direction === ConnectionDirection.Inbound
    ) {
      connection.port = message.port
    }

    peer.name = message.name
    peer.version = message.version
    peer.agent = message.agent
    peer.head = message.head
    peer.sequence = message.sequence
    peer.work = message.work
    peer.networkId = message.networkId
    peer.genesisBlockHash = message.genesisBlockHash
    peer.features = message.features

    // If we've told the peer to stay disconnected, repeat
    // the disconnection time before closing the connection
    const localRequestedDisconnectUntil =
      this.peerCandidates.get(message.identity)?.localRequestedDisconnectUntil ?? null

    if (localRequestedDisconnectUntil !== null && Date.now() < localRequestedDisconnectUntil) {
      const disconnectMessage = new DisconnectingMessage({
        destinationIdentity: message.identity,
        disconnectUntil: localRequestedDisconnectUntil,
        reason: DisconnectingReason.Congested,
        sourceIdentity: this.localPeer.publicIdentity,
      })
      connection.send(disconnectMessage)

      const error = `Closing connection from ${
        existingPeer?.displayName ?? message.identity
      } because they connected at ${Date.now()}, but we told them to disconnect until ${localRequestedDisconnectUntil}`
      this.logger.debug(error)
      connection.close(new NetworkError(error))
      return
    }

    // Identity has been successfully validated, update the peer's state
    connection.setState({ type: 'CONNECTED', identity: message.identity })
  }

  /**
   * Handle a signal request message relayed by another peer.
   * @param message An incoming SignalRequest message from a peer.
   */
  private handleSignalRequestMessage(
    messageSender: Peer,
    connection: Connection,
    message: SignalRequestMessage,
  ) {
    if (canInitiateWebRTC(message.sourceIdentity, message.destinationIdentity)) {
      this.logger.debug(
        `not handling signal request from ${message.sourceIdentity} to ${message.destinationIdentity} because source peer should have initiated`,
      )
      return
    }

    // Forward the message if it's not destined for us
    if (message.destinationIdentity !== this.localPeer.publicIdentity) {
      // Only forward it if the message was received from the same peer as it originated from
      if (message.sourceIdentity !== messageSender.state.identity) {
        this.logger.debug(
          `not forwarding signal request from ${
            messageSender.displayName
          } because the message's source identity (${
            message.sourceIdentity
          }) doesn't match the sender's identity (${String(messageSender.state.identity)})`,
        )
        return
      }

      const destinationPeer = this.getPeer(message.destinationIdentity)

      if (!destinationPeer) {
        this.logger.debug(
          `not forwarding signal request from ${messageSender.displayName} due to unknown peer ${message.destinationIdentity}`,
        )
        return
      }

      destinationPeer.send(message)
      return
    }

    let targetPeer = this.getPeer(message.sourceIdentity)
    if (targetPeer && targetPeer !== messageSender) {
      targetPeer.pushLoggedMessage({
        timestamp: Date.now(),
        direction: 'receive',
        message: message,
        brokeringPeerDisplayName: messageSender.displayName,
        type: connection.type,
      })
    }

    if (messageSender.state.identity !== null) {
      this.peerCandidates
        .get(message.sourceIdentity)
        ?.neighbors.add(messageSender.state.identity)
    }

    // Ignore the request if we're at max peers and don't have an existing connection
    if (this.shouldRejectDisconnectedPeers()) {
      if (!targetPeer || targetPeer.state.type !== 'CONNECTED') {
        const disconnectingMessage = new DisconnectingMessage({
          sourceIdentity: this.localPeer.publicIdentity,
          destinationIdentity: message.sourceIdentity,
          reason: DisconnectingReason.Congested,
          disconnectUntil: this.getCongestedDisconnectUntilTimestamp(),
        })
        messageSender.send(disconnectingMessage)
        this.logger.debug(
          `Ignoring signaling request from ${message.sourceIdentity}, at max peers`,
        )
        return
      }
    }

    targetPeer = this.getOrCreatePeer(message.sourceIdentity)

    if (targetPeer.state.type !== 'DISCONNECTED' && targetPeer.state.connections.webRtc) {
      this.logger.debug(
        `Ignoring signaling request from ${targetPeer.displayName} because we already have a connection`,
      )
      return
    }

    this.initWebRtcConnection(targetPeer, true)
  }

  /**
   * Handle a signal message relayed by another peer.
   * @param message An incoming Signal message from a peer.
   */
  private handleSignalMessage(
    messageSender: Peer,
    connection: Connection,
    message: SignalMessage,
  ) {
    // Forward the message if it's not destined for us
    if (message.destinationIdentity !== this.localPeer.publicIdentity) {
      messageSender.pushLoggedMessage(
        {
          timestamp: Date.now(),
          direction: 'receive',
          message: message,
          type: connection.type,
        },
        true,
      )

      // Only forward it if the message was received from the same peer as it originated from
      if (message.sourceIdentity !== messageSender.state.identity) {
        this.logger.debug(
          `not forwarding signal from ${
            messageSender.displayName
          } because the message's source identity (${
            message.sourceIdentity
          }) doesn't match the sender's identity (${String(messageSender.state.identity)})`,
        )
        return
      }

      const destinationPeer = this.getPeer(message.destinationIdentity)

      if (!destinationPeer) {
        this.logger.debug(
          `not forwarding signal from ${messageSender.displayName} due to unknown peer ${message.destinationIdentity}`,
        )
        return
      }

      const sendResult = destinationPeer.send(message)
      if (sendResult) {
        destinationPeer.pushLoggedMessage(
          {
            timestamp: Date.now(),
            direction: 'send',
            message: message,
            type: sendResult.type,
          },
          true,
        )
      }
      return
    }

    if (messageSender.state.identity !== null) {
      this.peerCandidates
        .get(message.sourceIdentity)
        ?.neighbors.add(messageSender.state.identity)
    }

    // Ignore the request if we're at max peers and don't have an existing connection
    if (this.shouldRejectDisconnectedPeers()) {
      const peer = this.getPeer(message.sourceIdentity)
      if (!peer || peer.state.type !== 'CONNECTED') {
        const disconnectingMessage = new DisconnectingMessage({
          sourceIdentity: this.localPeer.publicIdentity,
          destinationIdentity: message.sourceIdentity,
          reason: DisconnectingReason.Congested,
          disconnectUntil: this.getCongestedDisconnectUntilTimestamp(),
        })
        messageSender.send(disconnectingMessage)
        this.logger.debug(
          `Ignoring signaling request from ${message.sourceIdentity}, at max peers`,
        )
        return
      }
    }

    // Get or create a WebRTC connection for the signaling peer.
    const signalingPeer = this.getOrCreatePeer(message.sourceIdentity)

    let signalingConnection: WebRtcConnection

    if (
      signalingPeer.state.type === 'DISCONNECTED' ||
      signalingPeer.state.connections.webRtc === undefined
    ) {
      if (signalingPeer.state.identity === null) {
        this.logger.info('Peer must have an identity to begin signaling')
        return
      }

      if (!canInitiateWebRTC(signalingPeer.state.identity, message.destinationIdentity)) {
        this.logger.debug(
          `not handling signal message from ${signalingPeer.displayName} because source peer should have requested signaling`,
        )
        return
      }

      signalingConnection = this.initWebRtcConnection(signalingPeer, false)
    } else {
      signalingConnection = signalingPeer.state.connections.webRtc
    }

    // Try decrypting the message
    const { message: result } = this.localPeer.unboxMessage(
      message.signal,
      message.nonce,
      message.sourceIdentity,
    )

    // Close the connection if decrypting fails
    if (result === null) {
      const error = `Failed to decrypt signaling data from ${signalingPeer.displayName}`
      this.logger.debug(error)
      signalingConnection.close(new NetworkError(error))
      return
    }

    // Log the decrypted message on the signaling peer
    signalingPeer.pushLoggedMessage(
      {
        timestamp: Date.now(),
        direction: 'receive',
        message,
        brokeringPeerDisplayName:
          messageSender !== signalingPeer ? messageSender.displayName : undefined,
        type: connection.type,
      },
      true,
    )

    // Try JSON.parsing the decrypted message
    let signalData: SignalData
    try {
      signalData = JSON.parse(result) as SignalData
    } catch {
      const error = `Failed to decode signaling data from ${signalingPeer.displayName}`
      this.logger.debug(error)
      signalingConnection.close(new NetworkError(error))
      return
    }

    // We have the signaling data, so pass it on to the connection
    signalingConnection.signal(signalData)
  }

  private handlePeerListRequestMessage(peer: Peer) {
    const connectedPeers = []

    for (const p of this.identifiedPeers.values()) {
      if (p.state.type !== 'CONNECTED') {
        continue
      }

      connectedPeers.push({
        identity: Buffer.from(p.state.identity, 'base64'),
        name: p.name || undefined,
        address: p.address,
        port: p.port,
      })
    }

    const peerList = new PeerListMessage(connectedPeers)
    peer.send(peerList)
  }

  private handlePeerListMessage(peerList: PeerListMessage, peer: Peer) {
    if (peer.state.type !== 'CONNECTED') {
      this.logger.warn('Should not handle the peer list message unless peer is connected')
      return
    }

    for (const connectedPeer of peerList.connectedPeers) {
      const identity = connectedPeer.identity.toString('base64')

      // Don't include the local peer
      if (identity === this.localPeer.publicIdentity) {
        continue
      }

      // Don't include banned peers
      if (this.banned.has(identity)) {
        continue
      }

      const wsAddress = connectedPeer.address
        ? { host: connectedPeer.address, port: connectedPeer.port }
        : null

      this.peerCandidates.addFromPeerList(peer.state.identity, {
        identity,
        name: connectedPeer.name,
        wsAddress,
      })
    }
  }
}
