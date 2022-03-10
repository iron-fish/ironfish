/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { SignalData } from './connections/webRtcConnection'
import WSWebSocket from 'ws'
import { Event } from '../../event'
import { HostsStore } from '../../fileStores/hosts'
import { createRootLogger, Logger } from '../../logger'
import { MetricsMonitor } from '../../metrics'
import { ArrayUtils, SetIntervalToken } from '../../utils'
import {
  canInitiateWebRTC,
  canKeepDuplicateConnection,
  Identity,
  isIdentity,
} from '../identity'
import {
  DisconnectingMessage,
  DisconnectingReason,
  IncomingPeerMessage,
  InternalMessageType,
  isDisconnectingMessage,
  isIdentify,
  isMessage,
  isPeerList,
  isPeerListRequest,
  isSignal,
  isSignalRequest,
  LooseMessage,
  PeerList,
  PeerListRequest,
  Signal,
  SignalRequest,
} from '../messages'
import { parseUrl } from '../utils'
import { VERSION_PROTOCOL_MIN } from '../version'
import { AddressManager } from './addressManager'
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

  readonly banned = new Set<Identity>()

  /**
   * List of all peers, including both unidentified and identified.
   */
  peers: Array<Peer> = []

  addressManager: AddressManager

  /**
   * setInterval handle for requestPeerList, which sends out peer lists and
   * requests for peer lists
   */
  private requestPeerListHandle: SetIntervalToken | undefined

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
  readonly onMessage: Event<[Peer, IncomingPeerMessage<LooseMessage>]> = new Event()

  /**
   * Event fired when a peer's knownPeers list changes.
   */
  readonly onKnownPeersChanged: Event<[Peer]> = new Event()

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
    hostsStore: HostsStore,
    logger: Logger = createRootLogger(),
    metrics?: MetricsMonitor,
    maxPeers = 10000,
    targetPeers = 50,
    logPeerMessages = false,
  ) {
    this.logger = logger.withTag('peermanager')
    this.metrics = metrics || new MetricsMonitor({ logger: this.logger })
    this.localPeer = localPeer
    this.maxPeers = maxPeers
    this.targetPeers = targetPeers
    this.logPeerMessages = logPeerMessages
    this.addressManager = new AddressManager(hostsStore)
  }

  /**
   * Connect to a websocket by its uri. Establish a connection and solicit
   * the server's Identity.
   */
  connectToWebSocketAddress(uri: string, isWhitelisted = false): Peer {
    const url = parseUrl(uri)

    if (!url.hostname) {
      throw new Error(`Could not connect to ${uri} because hostname was not parseable`)
    }

    const peer = this.getOrCreatePeer(null)
    peer.setWebSocketAddress(url.hostname, url.port)
    peer.isWhitelisted = isWhitelisted
    this.connectToWebSocket(peer)
    return peer
  }

  /**
   * Connect to a peer using WebSockets
   * */
  connectToWebSocket(peer: Peer): boolean {
    if (!this.canConnectToWebSocket(peer)) {
      return false
    }

    // If we're trying to connect to the peer, we don't care about limiting the peer's connections to us
    peer.localRequestedDisconnectUntil = null
    peer.localRequestedDisconnectReason = null

    // Clear out peerRequestedDisconnect if we passed it
    peer.peerRequestedDisconnectUntil = null
    peer.peerRequestedDisconnectReason = null

    const address = peer.getWebSocketAddress()
    if (!address) {
      peer
        .getConnectionRetry(ConnectionType.WebSocket, ConnectionDirection.Outbound)
        .failedConnection(peer.isWhitelisted)

      return false
    }

    this.initWebSocketConnection(
      peer,
      new this.localPeer.webSocket(address),
      ConnectionDirection.Outbound,
      peer.address,
      peer.port,
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

    // If we're trying to connect to the peer, we don't care about limiting the peer's connections to us
    peer.localRequestedDisconnectUntil = null
    peer.localRequestedDisconnectReason = null

    // Clear out peerRequestedDisconnect if we passed it
    peer.peerRequestedDisconnectUntil = null
    peer.peerRequestedDisconnectReason = null

    if (peer.state.identity === null) {
      peer
        .getConnectionRetry(ConnectionType.WebRtc, ConnectionDirection.Outbound)
        .failedConnection(peer.isWhitelisted)

      return false
    }

    // Make sure we can find at least one brokering peer before we create the connection
    const brokeringPeer = this.getBrokeringPeer(peer)

    if (brokeringPeer === null) {
      this.logger.debug(
        `Attempted to establish a WebRTC connection to ${peer.displayName}, but couldn't find a peer to broker the connection.`,
      )

      peer
        .getConnectionRetry(ConnectionType.WebRtc, ConnectionDirection.Outbound)
        .failedConnection(peer.isWhitelisted)

      // If we don't have any brokering peers try disposing the peers
      this.tryDisposePeer(peer)
      return false
    }

    if (canInitiateWebRTC(this.localPeer.publicIdentity, peer.state.identity)) {
      this.initWebRtcConnection(peer, true)
      return true
    }

    const signal: SignalRequest = {
      type: InternalMessageType.signalRequest,
      payload: {
        sourceIdentity: this.localPeer.publicIdentity,
        destinationIdentity: peer.state.identity,
      },
    }

    const connection = this.initWebRtcConnection(peer, false)
    connection.setState({ type: 'REQUEST_SIGNALING' })
    brokeringPeer.send(signal)
    return true
  }

  createPeerFromInboundWebSocketConnection(
    webSocket: WebSocket | WSWebSocket,
    address: string | null,
  ): Peer {
    const peer = this.getOrCreatePeer(null)

    let hostname: string | null = null
    let port: number | null = null

    if (address) {
      const url = parseUrl(address)

      if (url.hostname) {
        hostname = url.hostname
        port = url.port
      }
    }

    this.initWebSocketConnection(peer, webSocket, ConnectionDirection.Inbound, hostname, port)

    return peer
  }

  /**
   * Perform WebSocket-specific connection setup.
   */
  private initWebSocketConnection(
    peer: Peer,
    ws: WebSocket | WSWebSocket,
    direction: ConnectionDirection,
    hostname: string | null,
    port: number | null,
  ): WebSocketConnection {
    const connection = new WebSocketConnection(ws, direction, this.logger, this.metrics, {
      simulateLatency: this.localPeer.simulateLatency,
      hostname: hostname || undefined,
      port: port || undefined,
    })

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
      simulateLatency: this.localPeer.simulateLatency,
    })

    connection.onSignal.on(async (data) => {
      let errorMessage
      if (peer.state.identity === null) {
        errorMessage = 'Cannot establish a WebRTC connection without a peer identity'
      }

      // Ensure one or more brokering peers exists before encrypting the signaling message,
      // but discard the brokering peer in case its state changes during encryption
      if (this.getBrokeringPeer(peer) === null) {
        errorMessage = 'Cannot establish a WebRTC connection without a brokering peer'
      }

      if (errorMessage !== undefined) {
        this.logger.debug(errorMessage)
        connection.close(new NetworkError(errorMessage))
        return
      }

      // Create the message only once, since this is a time-consuming operation
      const { nonce, boxedMessage } = await this.localPeer.boxMessage(
        JSON.stringify(data),
        peer.getIdentityOrThrow(),
      )

      for (let attempts = 0; attempts < MAX_WEBRTC_BROKERING_ATTEMPTS; attempts++) {
        const brokeringPeer = this.getBrokeringPeer(peer)
        if (brokeringPeer === null) {
          const message = 'Cannot establish a WebRTC connection without a brokering peer'
          this.logger.debug(message)
          connection.close(new NetworkError(message))
          return
        }

        const signal: Signal = {
          type: InternalMessageType.signal,
          payload: {
            sourceIdentity: this.localPeer.publicIdentity,
            destinationIdentity: peer.getIdentityOrThrow(),
            nonce: nonce,
            signal: boxedMessage,
          },
        }

        // If sending the message failed, try again (the brokeringPeer's state may have changed)
        const sendResult = brokeringPeer.send(signal)
        if (sendResult !== null) {
          brokeringPeer.pushLoggedMessage(
            {
              direction: 'send',
              message: {
                ...signal,
                payload: {
                  ...signal.payload,
                  signal: data,
                },
              },
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
                message: {
                  ...signal,
                  payload: {
                    ...signal.payload,
                    signal: data,
                  },
                },
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
    } else {
      const handler = () => {
        if (connection.state.type === 'WAITING_FOR_IDENTITY') {
          connection.send(this.localPeer.getIdentifyMessage())
          connection.onStateChanged.off(handler)
        }
      }
      connection.onStateChanged.on(handler)
    }
  }

  canConnectToWebSocket(peer: Peer, now = Date.now()): boolean {
    if (this.isBanned(peer)) {
      return false
    }

    const canEstablishNewConnection =
      peer.state.type !== 'DISCONNECTED' || this.canCreateNewConnections()

    const disconnectOk =
      peer.peerRequestedDisconnectUntil === null || now >= peer.peerRequestedDisconnectUntil

    const hasNoConnection =
      peer.state.type === 'DISCONNECTED' || peer.state.connections.webSocket === null

    const retryOk =
      peer.getConnectionRetry(ConnectionType.WebSocket, ConnectionDirection.Outbound)
        ?.canConnect || false

    return (
      canEstablishNewConnection &&
      disconnectOk &&
      hasNoConnection &&
      retryOk &&
      peer.address !== null
    )
  }

  canConnectToWebRTC(peer: Peer, now = Date.now()): boolean {
    if (this.isBanned(peer)) {
      return false
    }

    const canEstablishNewConnection =
      peer.state.type !== 'DISCONNECTED' || this.canCreateNewConnections()

    const disconnectOk =
      peer.peerRequestedDisconnectUntil === null || now >= peer.peerRequestedDisconnectUntil

    const hasNoConnection =
      peer.state.type === 'DISCONNECTED' || peer.state.connections.webRtc === undefined

    const retryOk =
      peer.getConnectionRetry(ConnectionType.WebRtc, ConnectionDirection.Outbound)
        ?.canConnect || false

    return (
      canEstablishNewConnection &&
      disconnectOk &&
      hasNoConnection &&
      retryOk &&
      peer.state.identity !== null
    )
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
    peer.localRequestedDisconnectReason = reason
    peer.localRequestedDisconnectUntil = until

    if (peer.state.type === 'DISCONNECTED') {
      return
    }

    const message: DisconnectingMessage = {
      type: InternalMessageType.disconnecting,
      payload: {
        sourceIdentity: this.localPeer.publicIdentity,
        destinationIdentity: peer.state.identity,
        reason,
        disconnectUntil: until,
      },
    }

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

  getPeersWithConnection(): ReadonlyArray<Peer> {
    return this.peers.filter((p) => p.state.type !== 'DISCONNECTED')
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
    return this.getPeersWithConnection().length < this.targetPeers
  }

  /**
   * True if we should reject connections from disconnected Peers.
   */
  shouldRejectDisconnectedPeers(): boolean {
    return this.getPeersWithConnection().length >= this.maxPeers
  }

  /** For a given peer, try to find a peer that's connected to that peer
   * including itself to broker a WebRTC connection to it
   * */
  private getBrokeringPeer(peer: Peer): Peer | null {
    if (peer.state.type === 'CONNECTED') {
      // Use the existing connection to the peer to broker the connection
      return peer
    }

    if (peer.state.identity === null) {
      // Cannot find a brokering peer of an unidentified peer
      return null
    }

    // Find another peer to broker the connection
    const candidates = []

    // The peer should know of any brokering peer candidates
    for (const [_, candidate] of peer.knownPeers) {
      if (
        // The brokering peer candidate should be connected to the local peer
        candidate.state.type === 'CONNECTED' &&
        // the brokering peer candidate should also know of the peer
        candidate.knownPeers.has(peer.state.identity)
      ) {
        candidates.push(candidate)
      }
    }

    if (candidates.length === 0) {
      return null
    }

    return ArrayUtils.sampleOrThrow(candidates)
  }

  /**
   * This function puts a peer in the identified peers map and should be called once
   * a peer is connected, meaning it has a connection tht has received an identity
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
      if (existingPeer.state.type !== 'DISCONNECTED' && existingPeer.state.connections.webRtc) {
        const error = `Replacing duplicate WebRTC connection on ${existingPeer.displayName}`
        this.logger.debug(new NetworkError(error))
        existingPeer
          .removeConnection(existingPeer.state.connections.webRtc)
          .close(new NetworkError(error))
      }
      existingPeer.setWebRtcConnection(peer.state.connections.webRtc)
      peer.removeConnection(peer.state.connections.webRtc)
    }

    if (peer.state.connections.webSocket?.state.type === 'CONNECTED') {
      if (
        existingPeer.state.type !== 'DISCONNECTED' &&
        existingPeer.state.connections.webSocket
      ) {
        const error = `Replacing duplicate WebSocket connection on ${existingPeer.displayName}`
        this.logger.debug(error)
        existingPeer
          .removeConnection(existingPeer.state.connections.webSocket)
          .close(new NetworkError(error))
      }
      existingPeer.setWebSocketConnection(peer.state.connections.webSocket)
      peer.removeConnection(peer.state.connections.webSocket)
    }

    // Clean up data so that the duplicate peer can be disposed
    peer
      .getConnectionRetry(ConnectionType.WebSocket, ConnectionDirection.Outbound)
      ?.neverRetryConnecting()

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
   * Given an identity, fetch a Peer with that identity or throw an error
   * @param identity A peer identity.
   */
  getPeerOrThrow(identity: Identity): Peer {
    const peer = this.identifiedPeers.get(identity)
    if (peer) {
      return peer
    }
    throw new Error(`No peer found with identity ${identity}`)
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
    peer.onMessage.on(async (message, connection) => {
      await this.handleMessage(peer, connection, message)
    })

    peer.onKnownPeersChanged.on(() => {
      this.onKnownPeersChanged.emit(peer)
    })

    peer.onStateChanged.on(({ prevState }) => {
      if (prevState.type !== 'CONNECTED' && peer.state.type === 'CONNECTED') {
        this.onConnect.emit(peer)
        this.onConnectedPeersChanged.emit()
      }
      if (prevState.type === 'CONNECTED' && peer.state.type !== 'CONNECTED') {
        this.onDisconnect.emit(peer)
        this.onConnectedPeersChanged.emit()
        this.tryDisposePeer(peer)
      }
    })

    peer.onStateChanged.on(({ prevState }) => {
      if (prevState.type !== 'CONNECTED' && peer.state.type === 'CONNECTED') {
        peer.send({ type: InternalMessageType.peerListRequest })
      }
    })

    peer.onBanned.on(() => this.banPeer(peer))

    return peer
  }

  banPeer(peer: Peer): void {
    const identity = peer.state.identity

    if (identity) {
      this.banned.add(identity)
    }

    peer.close()
  }

  isBanned(peer: Peer): boolean {
    return !!peer.state.identity && this.banned.has(peer.state.identity)
  }

  /**
   * Send a message to a peer, dropping the message if unable.
   * @param peer The peer identity to send a message to.
   * @param message The message to send.
   */
  sendTo(peer: Peer, message: LooseMessage): Connection | null {
    return peer.send(message)
  }

  /**
   * Send a message to all connected peers.
   */
  broadcast(message: LooseMessage): void {
    for (const peer of this.getConnectedPeers()) {
      peer.send(message)
    }
  }

  start(): void {
    this.requestPeerListHandle = setInterval(() => this.requestPeerList(), 60000)
    this.disposePeersHandle = setInterval(() => this.disposePeers(), 2000)
    this.savePeerAddressesHandle = setInterval(
      () => void this.addressManager.save(this.peers),
      60000,
    )
  }

  /**
   * Call when shutting down the PeerManager to clean up
   * outstanding connections.
   */
  async stop(): Promise<void> {
    this.requestPeerListHandle && clearInterval(this.requestPeerListHandle)
    this.disposePeersHandle && clearInterval(this.disposePeersHandle)
    this.savePeerAddressesHandle && clearInterval(this.savePeerAddressesHandle)
    await this.addressManager.save(this.peers)
    for (const peer of this.peers) {
      this.disconnect(peer, DisconnectingReason.ShuttingDown, 0)
    }
  }

  private requestPeerList() {
    const peerListRequest: PeerListRequest = {
      type: InternalMessageType.peerListRequest,
    }

    for (const peer of this.getConnectedPeers()) {
      peer.send(peerListRequest)
    }
  }

  /**
   * Gets a random disconnected peer address and returns a peer created from
   * said address
   */
  createRandomDisconnectedPeer(): Peer | null {
    const connectedPeers = Array.from(this.identifiedPeers.values()).flatMap((peer) => {
      if (peer.state.type !== 'DISCONNECTED' && peer.state.identity !== null) {
        return peer.state.identity
      } else {
        return []
      }
    })

    const peerAddress = this.addressManager.getRandomDisconnectedPeerAddress(connectedPeers)
    if (!peerAddress) {
      return null
    }

    const peer = this.getOrCreatePeer(peerAddress.identity)
    peer.setWebSocketAddress(peerAddress.address, peerAddress.port)
    peer.name = peerAddress.name || null
    return peer
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
  private tryDisposePeer(peer: Peer) {
    const hasAConnectedPeer = [...peer.knownPeers.values()].some(
      (p) => p.state.type === 'CONNECTED',
    )

    if (
      peer.state.type === 'DISCONNECTED' &&
      peer.getConnectionRetry(ConnectionType.WebSocket, ConnectionDirection.Outbound)
        ?.willNeverRetryConnecting
    ) {
      this.addressManager.removePeerAddress(peer)

      if (!hasAConnectedPeer) {
        this.logger.debug(
          `Disposing of peer with identity ${String(peer.state.identity)} (may be a duplicate)`,
        )

        peer.dispose()
        if (peer.state.identity && this.identifiedPeers.get(peer.state.identity) === peer) {
          this.identifiedPeers.delete(peer.state.identity)
        }
        this.peers = this.peers.filter((p) => p !== peer)
      }

      return true
    }
    return false
  }

  /**
   * Handler fired whenever we receive any message from a peer.
   *
   * If it is a signal message we need to forward it to the appropriate
   * webrtc peer.
   *
   * Note that the identity on IncomingPeerMessage is the identity of the
   * peer that sent it to us, not the original source.
   */
  private async handleMessage(peer: Peer, connection: Connection, message: LooseMessage) {
    if (isDisconnectingMessage(message)) {
      this.handleDisconnectingMessage(peer, connection, message)
    } else if (connection.state.type === 'WAITING_FOR_IDENTITY') {
      this.handleWaitingForIdentityMessage(peer, connection, message)
    } else if (isIdentify(message)) {
      this.logger.debug(
        `Closing connection to ${peer.displayName} that sent identity ${message.payload.identity} while connection is in state ${connection.state.type}`,
      )
    } else if (isSignalRequest(message)) {
      this.handleSignalRequestMessage(peer, connection, message)
    } else if (isSignal(message)) {
      await this.handleSignalMessage(peer, connection, message)
    } else if (isPeerListRequest(message)) {
      this.handlePeerListRequestMessage(peer)
    } else if (isPeerList(message)) {
      this.handlePeerListMessage(message, peer)
    } else {
      if (peer.state.identity === null) {
        const messageType = isMessage(message) ? message.type : 'Unknown'
        this.logger.debug(
          `Closing connection to unidentified peer that sent an unexpected message: ${messageType}`,
        )
        peer.close()
        return
      }
      this.onMessage.emit(peer, { peerIdentity: peer.state.identity, message: message })
    }
  }

  private handleDisconnectingMessage(
    messageSender: Peer,
    connection: Connection,
    message: DisconnectingMessage,
  ) {
    if (
      message.payload.destinationIdentity !== this.localPeer.publicIdentity &&
      message.payload.destinationIdentity !== null
    ) {
      // Only forward it if the message was received from the same peer as it originated from
      if (message.payload.sourceIdentity !== messageSender.state.identity) {
        this.logger.debug(
          `not forwarding disconnect from ${
            messageSender.displayName
          } because the message's source identity (${
            message.payload.sourceIdentity
          }) doesn't match the sender's identity (${String(messageSender.state.identity)})`,
        )
        return
      }

      const destinationPeer = this.getPeer(message.payload.destinationIdentity)

      if (!destinationPeer) {
        this.logger.debug(
          'not forwarding disconnect from',
          messageSender.displayName,
          'due to unknown peer',
          message.payload.destinationIdentity,
        )
        return
      }

      this.sendTo(destinationPeer, message)
      return
    }

    let disconnectingPeer
    if (messageSender.state.identity === null) {
      // If the message sender has no identity yet, assume they requested the disconnect, since
      // they shouldn't be forwarding messages for other peers before our state is CONNECTED.
      disconnectingPeer = messageSender
    } else {
      // Otherwise, the sourceIdentity on the message requested the disconnect.
      disconnectingPeer = this.getPeer(message.payload.sourceIdentity)
      if (!disconnectingPeer) {
        this.logger.debug(
          `Received disconnect request from ${message.payload.sourceIdentity} but have no peer with that identity`,
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

    disconnectingPeer.peerRequestedDisconnectReason = message.payload.reason
    disconnectingPeer.peerRequestedDisconnectUntil = message.payload.disconnectUntil
    this.logger.debug(
      `${disconnectingPeer.displayName} requested we disconnect until ${
        message.payload.disconnectUntil
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
  private handleWaitingForIdentityMessage(
    peer: Peer,
    connection: Connection,
    message: LooseMessage,
  ): void {
    // If we receive any message other than an Identity message, close the connection
    if (!isIdentify(message)) {
      this.logger.debug(
        `Disconnecting from ${peer.displayName} - Sent unexpected message ${message.type} while waiting for identity`,
      )
      peer.close()
      return
    }

    const identity = message.payload.identity
    const version = message.payload.version
    const agent = message.payload.agent
    const port = message.payload.port
    const name = message.payload.name || null

    if (!isIdentity(identity)) {
      this.logger.debug(
        `Disconnecting from ${identity} - Identity does not match expected format`,
      )
      peer
        .getConnectionRetry(connection.type, connection.direction)
        ?.failedConnection(peer.isWhitelisted)
      peer.close(new Error(`Identity ${identity} does not match expected format`))
      return
    }

    if (version < VERSION_PROTOCOL_MIN) {
      const error = `Peer version ${message.payload.version} is not compatible with our minimum: ${VERSION_PROTOCOL_MIN}`
      this.logger.debug(`Disconnecting from ${identity} - ${error}`)

      peer
        .getConnectionRetry(connection.type, connection.direction)
        ?.failedConnection(peer.isWhitelisted)
      peer.close(new Error(error))
      return
    }

    if (this.banned.has(identity)) {
      peer.getConnectionRetry(connection.type, connection.direction)?.neverRetryConnecting()
      peer.close(new Error('banned'))
      return
    }

    if (name && name.length > 32) {
      this.logger.debug(
        `Disconnecting from ${identity} - Peer name length exceeds 32: ${name.length}}`,
      )
      peer
        .getConnectionRetry(connection.type, connection.direction)
        ?.failedConnection(peer.isWhitelisted)
      peer.close(new Error(`Peer name length exceeds 32: ${name.length}}`))
      return
    }

    // If we've connected to ourselves, get rid of the connection and take the address and port off the Peer.
    // This can happen if a node stops and starts with a different identity
    if (identity === this.localPeer.publicIdentity) {
      peer.removeConnection(connection)
      peer.getConnectionRetry(connection.type, connection.direction)?.neverRetryConnecting()

      if (
        connection.type === ConnectionType.WebSocket &&
        connection.direction === ConnectionDirection.Outbound
      ) {
        peer.setWebSocketAddress(null, null)
      }

      const error = `Closing ${connection.type} connection from our own identity`
      this.logger.debug(error)
      connection.close(new NetworkError(error))
      this.tryDisposePeer(peer)
      return
    }

    // If we already know the peer's identity and the new identity doesn't match, move the connection
    // to a Peer with the new identity.
    if (peer.state.identity !== null && peer.state.identity !== identity) {
      this.logger.debug(
        `${peer.displayName} sent identity ${identity}, but already has identity ${peer.state.identity}`,
      )

      peer.removeConnection(connection)
      peer.getConnectionRetry(connection.type, connection.direction)?.neverRetryConnecting()

      const originalPeer = peer
      peer = this.getOrCreatePeer(identity)

      if (connection instanceof WebRtcConnection) {
        peer.setWebRtcConnection(connection)
      } else if (connection instanceof WebSocketConnection) {
        if (
          connection.type === ConnectionType.WebSocket &&
          connection.direction === ConnectionDirection.Outbound &&
          originalPeer.address !== null
        ) {
          peer.setWebSocketAddress(originalPeer.address, originalPeer.port)
          originalPeer.setWebSocketAddress(null, null)
        }
        peer.setWebSocketConnection(connection)
      }
    }

    const existingPeer = this.getPeer(identity)

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
      if (canKeepDuplicateConnection(identity, this.localPeer.publicIdentity)) {
        if (connection.direction === ConnectionDirection.Outbound) {
          connectionToClose = connection
        } else if (existingConnection.direction === ConnectionDirection.Outbound) {
          connectionToClose = existingConnection
        }
      }

      // We keep our outbound connection
      if (canKeepDuplicateConnection(this.localPeer.publicIdentity, identity)) {
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
      connection.port = port || undefined
    }

    peer.name = name
    peer.version = version
    peer.agent = agent
    peer.head = Buffer.from(message.payload.head, 'hex')
    peer.sequence = message.payload.sequence
    peer.work = BigInt(message.payload.work)

    // If we've told the peer to stay disconnected, repeat
    // the disconnection time before closing the connection
    if (
      existingPeer !== null &&
      existingPeer.localRequestedDisconnectUntil !== null &&
      Date.now() < existingPeer.localRequestedDisconnectUntil
    ) {
      const disconnectMessage: DisconnectingMessage = {
        type: InternalMessageType.disconnecting,
        payload: {
          sourceIdentity: this.localPeer.publicIdentity,
          destinationIdentity: identity,
          reason: existingPeer.localRequestedDisconnectReason || DisconnectingReason.Congested,
          disconnectUntil: existingPeer.localRequestedDisconnectUntil,
        },
      }
      connection.send(disconnectMessage)

      const error = `Closing connection from ${
        existingPeer.displayName
      } because they connected at ${Date.now()}, but we told them to disconnect until ${
        existingPeer.localRequestedDisconnectUntil
      }`
      this.logger.debug(error)
      connection.close(new NetworkError(error))
      return
    }

    // Identity has been successfully validated, update the peer's state
    connection.setState({ type: 'CONNECTED', identity: identity })
  }

  /**
   * Handle a signal request message relayed by another peer.
   * @param message An incoming SignalRequest message from a peer.
   */
  private handleSignalRequestMessage(
    messageSender: Peer,
    connection: Connection,
    message: SignalRequest,
  ) {
    if (
      canInitiateWebRTC(message.payload.sourceIdentity, message.payload.destinationIdentity)
    ) {
      this.logger.debug(
        'not handling signal request from',
        message.payload.sourceIdentity,
        'to',
        message.payload.destinationIdentity,
        'because source peer should have initiated',
      )
      return
    }

    // Forward the message if it's not destined for us
    if (message.payload.destinationIdentity !== this.localPeer.publicIdentity) {
      // Only forward it if the message was received from the same peer as it originated from
      if (message.payload.sourceIdentity !== messageSender.state.identity) {
        this.logger.debug(
          `not forwarding signal request from ${
            messageSender.displayName
          } because the message's source identity (${
            message.payload.sourceIdentity
          }) doesn't match the sender's identity (${String(messageSender.state.identity)})`,
        )
        return
      }

      const destinationPeer = this.getPeer(message.payload.destinationIdentity)

      if (!destinationPeer) {
        this.logger.debug(
          'not forwarding signal request from',
          messageSender.displayName,
          'due to unknown peer',
          message.payload.destinationIdentity,
        )
        return
      }

      this.sendTo(destinationPeer, message)
      return
    }

    let targetPeer = this.getPeer(message.payload.sourceIdentity)
    if (targetPeer && targetPeer !== messageSender) {
      targetPeer.pushLoggedMessage({
        timestamp: Date.now(),
        direction: 'receive',
        message: message,
        brokeringPeerDisplayName: messageSender.displayName,
        type: connection.type,
      })
    }

    // Ignore the request if we're at max peers and don't have an existing connection
    if (this.shouldRejectDisconnectedPeers()) {
      if (!targetPeer || targetPeer.state.type !== 'CONNECTED') {
        const disconnectingMessage: DisconnectingMessage = {
          type: InternalMessageType.disconnecting,
          payload: {
            sourceIdentity: this.localPeer.publicIdentity,
            destinationIdentity: message.payload.sourceIdentity,
            reason: DisconnectingReason.Congested,
            disconnectUntil: this.getCongestedDisconnectUntilTimestamp(),
          },
        }
        messageSender.send(disconnectingMessage)
        this.logger.debug(
          `Ignoring signaling request from ${message.payload.sourceIdentity}, at max peers`,
        )
        return
      }
    }

    targetPeer = this.getOrCreatePeer(message.payload.sourceIdentity)
    this.addKnownPeerTo(targetPeer, messageSender)

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
  private async handleSignalMessage(
    messageSender: Peer,
    connection: Connection,
    message: Signal,
  ) {
    // Forward the message if it's not destined for us
    if (message.payload.destinationIdentity !== this.localPeer.publicIdentity) {
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
      if (message.payload.sourceIdentity !== messageSender.state.identity) {
        this.logger.debug(
          `not forwarding signal from ${
            messageSender.displayName
          } because the message's source identity (${
            message.payload.sourceIdentity
          }) doesn't match the sender's identity (${String(messageSender.state.identity)})`,
        )
        return
      }

      const destinationPeer = this.getPeer(message.payload.destinationIdentity)

      if (!destinationPeer) {
        this.logger.debug(
          'not forwarding signal from',
          messageSender.displayName,
          'due to unknown peer',
          message.payload.destinationIdentity,
        )
        return
      }

      const sendResult = this.sendTo(destinationPeer, message)
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

    // Ignore the request if we're at max peers and don't have an existing connection
    if (this.shouldRejectDisconnectedPeers()) {
      const peer = this.getPeer(message.payload.sourceIdentity)
      if (!peer || peer.state.type !== 'CONNECTED') {
        const disconnectingMessage: DisconnectingMessage = {
          type: InternalMessageType.disconnecting,
          payload: {
            sourceIdentity: this.localPeer.publicIdentity,
            destinationIdentity: message.payload.sourceIdentity,
            reason: DisconnectingReason.Congested,
            disconnectUntil: this.getCongestedDisconnectUntilTimestamp(),
          },
        }
        messageSender.send(disconnectingMessage)
        this.logger.debug(
          `Ignoring signaling request from ${message.payload.sourceIdentity}, at max peers`,
        )
        return
      }
    }

    // Get or create a WebRTC connection for the signaling peer.
    const signalingPeer = this.getOrCreatePeer(message.payload.sourceIdentity)
    this.addKnownPeerTo(signalingPeer, messageSender)

    let signalingConnection: WebRtcConnection

    if (
      signalingPeer.state.type === 'DISCONNECTED' ||
      signalingPeer.state.connections.webRtc === undefined
    ) {
      if (signalingPeer.state.identity === null) {
        this.logger.log('Peer must have an identity to begin signaling')
        return
      }

      if (
        !canInitiateWebRTC(signalingPeer.state.identity, message.payload.destinationIdentity)
      ) {
        this.logger.debug(
          'not handling signal message from',
          signalingPeer.displayName,
          'because source peer should have requested signaling',
        )
        return
      }

      signalingConnection = this.initWebRtcConnection(signalingPeer, false)
    } else {
      signalingConnection = signalingPeer.state.connections.webRtc
    }

    // Try decrypting the message
    const { message: result } = await this.localPeer.unboxMessage(
      message.payload.signal,
      message.payload.nonce,
      message.payload.sourceIdentity,
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
        message: { ...message, payload: { message: result } },
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

      if (peer.knownPeers.has(p.state.identity)) {
        continue
      }

      connectedPeers.push({
        identity: p.state.identity,
        name: p.name || undefined,
        address: p.address,
        port: p.port,
      })
    }

    const peerList: PeerList = {
      type: InternalMessageType.peerList,
      payload: { connectedPeers },
    }

    this.sendTo(peer, peerList)
  }

  private handlePeerListMessage(peerList: PeerList, peer: Peer) {
    if (peer.state.type !== 'CONNECTED') {
      this.logger.warn('Should not handle the peer list message unless peer is connected')
      return
    }

    let changed = false

    const newPeerSet = peerList.payload.connectedPeers.reduce(
      (memo, peer) => {
        memo.set(peer.identity, peer)
        return memo
      },
      new Map<
        Identity,
        {
          identity: Identity
          name?: string
          address: string | null
          port: number | null
        }
      >(),
    )

    // Don't include the local peer in the peer graph
    newPeerSet.delete(this.localPeer.publicIdentity)

    // Remove peer edges that are no longer in the peer list.
    for (const [otherIdentity, otherPeer] of peer.knownPeers) {
      if (!newPeerSet.has(otherIdentity)) {
        peer.knownPeers.delete(otherIdentity)
        // Optimistically update the edges.
        // This could result in pinging back and forth if peers don't agree whether they're connected
        otherPeer.knownPeers.delete(peer.state.identity)
        // See if removing edges from either peer caused it to be disposable
        this.tryDisposePeer(peer)
        this.tryDisposePeer(otherPeer)
        changed = true
      }
    }

    // Add peer edges that are new to the peer list
    for (const newPeer of newPeerSet.values()) {
      if (!peer.knownPeers.has(newPeer.identity)) {
        const knownPeer = this.getOrCreatePeer(newPeer.identity)
        knownPeer.setWebSocketAddress(newPeer.address, newPeer.port)
        knownPeer.name = newPeer.name || null
        this.addKnownPeerTo(knownPeer, peer, false)
        changed = true
      }
    }

    if (changed) {
      peer.onKnownPeersChanged.emit()
    }
  }

  /**
   * This is used for adding a peer to a peers known list. It also handles adding it bi-directionally
   * and emits peer.onKnownPeersChanged by default.
   * @param peer The peer to put into `addTo's` knownPeers
   * @param addTo The peer to add `peer` to
   * @param emitKnownPeersChanged Set this to false if you are adding known peers in bulk and you know you want to emit this yourself
   */
  addKnownPeerTo(peer: Peer, addTo: Peer, emitKnownPeersChanged = true): void {
    if (!peer.state.identity || !addTo.state.identity) {
      return
    }
    if (peer.state.identity === addTo.state.identity) {
      return
    }

    if (!addTo.knownPeers.has(peer.state.identity)) {
      addTo.knownPeers.set(peer.state.identity, peer)

      if (emitKnownPeersChanged) {
        addTo.onKnownPeersChanged.emit()
      }
    }

    // Optimistically update the edges. This could result in pinging back and forth if peers don't agree whether they're connected
    if (!peer.knownPeers.has(addTo.state.identity)) {
      this.addKnownPeerTo(addTo, peer)
    }
  }
}
