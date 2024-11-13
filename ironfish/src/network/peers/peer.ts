/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { BlockHash } from '../../primitives/blockheader'
import LRU from 'blru'
import { BufferMap } from 'buffer-map'
import colors from 'colors/safe'
import { Event } from '../../event'
import { createRootLogger, Logger } from '../../logger'
import { MetricsMonitor } from '../../metrics'
import { ErrorUtils } from '../../utils'
import { Identity } from '../identity'
import { NetworkMessage } from '../messages/networkMessage'
import { NetworkMessageType } from '../types'
import { WebSocketAddress } from '../utils'
import { NetworkError, WebRtcConnection, WebSocketConnection } from './connections'
import { Connection, ConnectionType } from './connections/connection'
import { Features } from './peerFeatures'

export enum BAN_SCORE {
  NO = 0,
  LOW = 1,
  MED = 5,
  MAX = 10,
}

/**
 * Message types that should be excluded from loggedMessages (unless overridden).
 */
const UNLOGGED_MESSAGE_TYPES: ReadonlyArray<NetworkMessageType> = [
  NetworkMessageType.PeerList,
  NetworkMessageType.Signal,
]

type LoggedMessage = {
  brokeringPeerDisplayName?: string
  direction: 'send' | 'receive'
  message: NetworkMessage
  timestamp: number
  type: ConnectionType
}

/**
 * PeerConnectionState contains at least one connection, as well as an optional second connection.
 */
type PeerConnectionState =
  | { webSocket: WebSocketConnection; webRtc: WebRtcConnection }
  | { webSocket?: undefined; webRtc: WebRtcConnection }
  | { webSocket: WebSocketConnection; webRtc?: undefined }

export type PeerState =
  /* Identity may exist if the peer is known by another peer, or has been previously connected to */
  | { type: 'DISCONNECTED'; identity: Identity | null }
  /* Peer has at least one connection, but none are ready to send/receive messages */
  | {
      type: 'CONNECTING'
      identity: Identity | null
      connections: Readonly<PeerConnectionState>
    }
  /* Peer has at least one connection that has been identified and is ready to send/receive messages */
  | {
      type: 'CONNECTED'
      identity: Identity
      connections: Readonly<PeerConnectionState>
    }

export enum KnownBlockHashesValue {
  Received = 1,
  Sent = 2,
}

export class Peer {
  readonly pendingRPCMax: number
  readonly logger: Logger

  metrics?: MetricsMonitor

  /**
   * The current state of the peer.
   */
  private _state: Readonly<PeerState>
  get state(): Readonly<PeerState> {
    return this._state
  }

  get isSaturated(): boolean {
    return this.pendingRPC >= this.pendingRPCMax
  }

  /**
   * The last error the peer encountered
   */
  private _error: Readonly<unknown> | null
  get error(): Readonly<unknown> | null {
    return this._error
  }

  banScore = 0
  maxBanScore: number

  /**
   * name associated with this peer
   */
  name: string | null = null

  /**
   * The peer's protocol version
   */
  version: number | null = null

  /**
   * The peer's agent
   */
  agent: string | null = null

  /**
   * The peer's heaviest head hash
   */
  head: Buffer | null = null

  /**
   * The peer's heaviest head cumulative work
   */
  work: bigint | null = null

  /**
   * The peer's heaviest head sequence
   */
  sequence: number | null = null

  /**
   * The peer's network ID
   */
  networkId: number | null = null

  /**
   * The peer's genesis block hash
   */
  genesisBlockHash: Buffer | null = null

  /**
   * Features supported by the peer
   */
  features: Features | null = null

  /**
   * The loggable name of the peer. For a more specific value,
   * try Peer.name or Peer.state.identity.
   */
  get displayName(): string {
    if (this.state.identity === null) {
      return 'unidentified'
    }

    const identitySlice = this.state.identity.slice(0, 7)
    if (this.name) {
      return `${identitySlice} (${this.name})`
    }
    return identitySlice
  }

  /**
   * The address by which the peer can be connected to over WebSockets.
   * Setting this to null makes a peer unconnectable via WebSocket outbound connections.
   */
  wsAddress: WebSocketAddress | null = null

  /**
   * address associated with this peer
   */
  get address(): string | null {
    return this.wsAddress?.host || null
  }

  /**
   * port associated with this peer
   */
  get port(): number | null {
    return this.wsAddress?.port || null
  }

  /** how many outbound connections does the peer have */
  pendingRPC = 0

  /**
   * True if the peer is a known honest peer.
   */
  isWhitelisted = false

  shouldLogMessages = false

  loggedMessages: Array<LoggedMessage> = []

  /**
   * Blocks that have been sent or received from this peer. Value is set to true if the block was received
   * from the peer, and false if the block was sent to the peer.
   */
  readonly knownBlockHashes: LRU<BlockHash, KnownBlockHashesValue> = new LRU<
    BlockHash,
    KnownBlockHashesValue
  >(1024, null, BufferMap)

  /**
   * Event fired for every new incoming message that needs to be processed
   * by the application layer. Includes the connection from which the message
   * was received.
   */
  readonly onMessage: Event<[NetworkMessage, Connection]> = new Event()

  /**
   * Fired when the peer should be banned
   */
  readonly onBanned: Event<[string]> = new Event()

  /**
   * Event fired when the peer changes state. The event may fire when connections change, even if the
   * state type stays the same.
   */
  readonly onStateChanged: Event<[{ peer: Peer; state: PeerState; prevState: PeerState }]> =
    new Event()

  constructor(
    identity: Identity | null,
    {
      logger = createRootLogger(),
      maxPending = 5,
      maxBanScore = BAN_SCORE.MAX,
      shouldLogMessages = false,
      metrics,
    }: {
      logger?: Logger
      maxPending?: number
      maxBanScore?: number
      shouldLogMessages?: boolean
      metrics?: MetricsMonitor
    } = {},
  ) {
    this.logger = logger.withTag('Peer')
    this.pendingRPCMax = maxPending
    this.maxBanScore = maxBanScore
    this.metrics = metrics
    this.shouldLogMessages = shouldLogMessages
    this._error = null
    this._state = {
      type: 'DISCONNECTED',
      identity: identity,
    }
  }

  /**
   * Sets a WebRTC connection on the peer, moving it into the CONNECTING state if necessary.
   * Ignores the connection if the peer already has a WebRTC connection.
   * @param connection The WebRTC connection to set
   */
  setWebRtcConnection(connection: WebRtcConnection): void {
    if (this.state.type !== 'DISCONNECTED' && this.state.connections.webRtc) {
      this.logger.warn('Already have a WebRTC connection, ignoring the new one')
      return
    }

    const webSocket =
      this.state.type !== 'DISCONNECTED' ? this.state.connections.webSocket : undefined

    this.setState(webSocket, connection)
  }

  /**
   * Replaces a WebRTC connection on the peer, moving it into the CONNECTING state if necessary.
   * Closes the existing connection if the peer already has a WebRTC connection.
   * @param connection The WebRTC connection to set
   */
  replaceWebRtcConnection(connection: WebRtcConnection): void {
    let existingConnection = null
    if (this.state.type !== 'DISCONNECTED' && this.state.connections.webRtc) {
      existingConnection = this.state.connections.webRtc
    }

    const webSocket =
      this.state.type !== 'DISCONNECTED' ? this.state.connections.webSocket : undefined

    this.setState(webSocket, connection)

    if (existingConnection) {
      const error = `Replacing duplicate WebRTC connection on ${this.displayName}`
      this.logger.debug(ErrorUtils.renderError(new NetworkError(error)))
      existingConnection.close(new NetworkError(error))
    }
  }

  /**
   * Sets a WebSocket connection on the peer, moving it into the CONNECTING state if necessary.
   * Ignores the connection if the peer already has a WebSocket connection.
   * @param connection The WebSocket connection to set
   */
  setWebSocketConnection(connection: WebSocketConnection): void {
    if (this.state.type !== 'DISCONNECTED' && this.state.connections.webSocket) {
      this.logger.debug(
        `Peer ${this.displayName} already has a websocket connection to ${
          this.address
        }, ignoring new one at ${
          connection.address ? connection.address.host : 'Unknown host'
        }`,
      )
      return
    }

    const webRtc =
      this.state.type !== 'DISCONNECTED' ? this.state.connections.webRtc : undefined

    this.setState(connection, webRtc)
  }

  /**
   * Replaces a WebSocket connection on the peer, moving it into the CONNECTING state if necessary.
   * Closes the existing connection if the peer already has a WebSocket connection.
   * @param connection The WebSocket connection to set
   */
  replaceWebSocketConnection(connection: WebSocketConnection): void {
    let existingConnection = null
    if (this.state.type !== 'DISCONNECTED' && this.state.connections.webSocket) {
      existingConnection = this.state.connections.webSocket
    }

    const webRtc =
      this.state.type !== 'DISCONNECTED' ? this.state.connections.webRtc : undefined

    this.setState(connection, webRtc)

    if (existingConnection) {
      const error = `Replacing duplicate WebSocket connection on ${this.displayName}`
      this.logger.debug(ErrorUtils.renderError(new NetworkError(error)))
      existingConnection.close(new NetworkError(error))
    }
  }

  private computeStateFromConnections(
    wsConnection: WebSocketConnection | undefined,
    webRtcConnection: WebRtcConnection | undefined,
  ): PeerState {
    // If both connections are either disconnected or don't exist, the
    // state should be DISCONNECTED
    if (
      (!wsConnection || wsConnection.state.type === 'DISCONNECTED') &&
      (!webRtcConnection || webRtcConnection.state.type === 'DISCONNECTED')
    ) {
      return { type: 'DISCONNECTED', identity: this.state.identity }
    }

    // If at least one connection is CONNECTED, the state should be CONNECTED
    // TODO: Need to resolve what happens if identities conflict
    if (webRtcConnection && webRtcConnection.state.type === 'CONNECTED') {
      return {
        type: 'CONNECTED',
        identity: webRtcConnection.state.identity,
        connections: {
          webSocket: wsConnection,
          webRtc: webRtcConnection,
        },
      }
    } else if (wsConnection && wsConnection.state.type === 'CONNECTED') {
      return {
        type: 'CONNECTED',
        identity: wsConnection.state.identity,
        connections: {
          webSocket: wsConnection,
          webRtc: webRtcConnection,
        },
      }
    }

    if (webRtcConnection) {
      return {
        type: 'CONNECTING',
        identity: this.state.identity,
        connections: {
          webRtc: webRtcConnection,
          webSocket: wsConnection,
        },
      }
    } else if (wsConnection) {
      return {
        type: 'CONNECTING',
        identity: this.state.identity,
        connections: {
          webRtc: webRtcConnection,
          webSocket: wsConnection,
        },
      }
    } else {
      throw new Error('At least one of webRtcConnection or wsConnection must be defined')
    }
  }

  /**
   * Removes a connection from the peer, doing nothing if it doesn't exist on the peer.
   * @param connection The connection to remove
   */
  removeConnection(connection: Connection): Connection {
    if (this.state.type === 'DISCONNECTED') {
      return connection
    }

    const wsConnection =
      connection === this.state.connections.webSocket
        ? undefined
        : this.state.connections.webSocket

    const webRtcConnection =
      connection === this.state.connections.webRtc ? undefined : this.state.connections.webRtc

    this.setState(wsConnection, webRtcConnection)

    return connection
  }

  /**
   * Gets the peer's identity, or throws an error if the peer is unidentified.
   */
  getIdentityOrThrow(): Identity {
    if (this.state.identity === null) {
      throw new Error('Called getIdentityOrThrow on an unidentified peer')
    }
    return this.state.identity
  }

  /**
   * Records number messages sent using a rolling average
   */
  private recordMessageSent() {
    // don't start the meter until we actually want to record a message to save resources
    if (this.state.identity && this.metrics) {
      let meter = this.metrics.p2p_OutboundMessagesByPeer.get(this.state.identity)
      if (!meter) {
        meter = this.metrics.addMeter()
        this.metrics.p2p_OutboundMessagesByPeer.set(this.state.identity, meter)
      }
      meter.add(1)
    }
  }

  private disposeMessageMeter() {
    if (this.state.identity && this.metrics) {
      this.metrics.p2p_OutboundMessagesByPeer.get(this.state.identity)?.stop()
      this.metrics.p2p_OutboundMessagesByPeer.delete(this.state.identity)
    }
  }

  /**
   * Sends a message over the peer's connection if CONNECTED, else drops it.
   * @param message The message to send.
   */
  send(message: NetworkMessage): Connection | null {
    // Return early if peer is not in state CONNECTED
    if (this.state.type !== 'CONNECTED') {
      this.logger.debug(
        `Attempted to send a ${message.displayType()} message to ${this.displayName} in state ${
          this.state.type
        }`,
      )
      return null
    }

    if (
      this.state.type === 'CONNECTED' &&
      this.state.connections.webRtc?.state.type === 'CONNECTED'
    ) {
      if (this.state.connections.webRtc.send(message)) {
        this.pushLoggedMessage({
          direction: 'send',
          message,
          timestamp: Date.now(),
          type: ConnectionType.WebRtc,
        })
        this.recordMessageSent()
        return this.state.connections.webRtc
      }
    }

    // If a WebRTC message fails to send and we don't have a WebSocket connection,
    // the peer's state will now be DISCONNECTED, so recheck the state here
    if (
      this.state.type === 'CONNECTED' &&
      this.state.connections.webSocket?.state.type === 'CONNECTED'
    ) {
      if (this.state.connections.webSocket.send(message)) {
        this.pushLoggedMessage({
          direction: 'send',
          message,
          timestamp: Date.now(),
          type: ConnectionType.WebSocket,
        })
        this.recordMessageSent()
        return this.state.connections.webSocket
      }
    }

    // The message could not be sent on any connection
    return null
  }

  private getConnectionStateOrDefault(state: PeerState) {
    return state.type === 'DISCONNECTED'
      ? { webRtc: undefined, webSocket: undefined }
      : state.connections
  }

  private readonly connectionMessageHandlers: Map<
    Connection,
    (message: NetworkMessage) => void
  > = new Map<Connection, (message: NetworkMessage) => void>()

  private readonly connectionStateChangedHandlers: Map<Connection, () => void> = new Map<
    Connection,
    () => void
  >()

  private unbindConnectionEvents(connection?: Connection): void {
    if (!connection) {
      return
    }

    // onMessage
    const messageHandler = this.connectionMessageHandlers.get(connection)
    if (messageHandler) {
      connection.onMessage.off(messageHandler)
      this.connectionMessageHandlers.delete(connection)
    }

    // onStateChanged
    const stateChangedHandler = this.connectionStateChangedHandlers.get(connection)
    if (stateChangedHandler) {
      connection.onStateChanged.off(stateChangedHandler)
      this.connectionStateChangedHandlers.delete(connection)
    }
  }

  private bindConnectionEvents(connection?: Connection): void {
    if (!connection) {
      return
    }

    if (
      connection.state.type === 'CONNECTED' &&
      connection instanceof WebSocketConnection &&
      connection.address
    ) {
      this.wsAddress = connection.address
    }

    // onMessage
    if (!this.connectionMessageHandlers.has(connection)) {
      const messageHandler = (message: NetworkMessage) => {
        this.pushLoggedMessage({
          direction: 'receive',
          message,
          timestamp: Date.now(),
          type: connection.type,
        })
        this.onMessage.emit(message, connection)
      }
      this.connectionMessageHandlers.set(connection, messageHandler)
      connection.onMessage.on(messageHandler)
    }

    // onStateChanged
    if (!this.connectionStateChangedHandlers.has(connection)) {
      const stateChangedHandler = () => {
        if (this.state.type === 'DISCONNECTED') {
          throw new Error('Peer should not have any connections while in DISCONNECTED state')
        }

        if (connection.state.type === 'DISCONNECTED') {
          this.logger.debug(
            `Connection closing ${connection.type} for ${this.displayName}: ${
              ErrorUtils.renderError(connection.error) || 'Reason Unknown'
            }`,
          )

          if (connection.error !== null) {
            this._error = connection.error
          }

          this.removeConnection(connection)
          return
        }

        if (connection.state.type === 'CONNECTED') {
          // If connection goes to connected, transition the peer to connected
          if (connection instanceof WebSocketConnection && connection.address) {
            this.wsAddress = connection.address
          }
          this.setState(this.state.connections.webSocket, this.state.connections.webRtc)
        }
      }
      this.connectionStateChangedHandlers.set(connection, stateChangedHandler)
      connection.onStateChanged.on(stateChangedHandler)
    }
  }

  /**
   * Changes the peer's state from this.state to nextState.
   * @param nextState The new peer state.
   */
  private setState(
    wsConnection: WebSocketConnection | undefined,
    webRtcConnection: WebRtcConnection | undefined,
  ): void {
    const nextState = this.computeStateFromConnections(wsConnection, webRtcConnection)

    // Perform pre-transition actions
    const lastConState = this.getConnectionStateOrDefault(this.state)
    const nextConState = this.getConnectionStateOrDefault(nextState)

    if (lastConState.webRtc !== nextConState.webRtc) {
      this.unbindConnectionEvents(lastConState.webRtc)
      this.bindConnectionEvents(nextConState.webRtc)
    }
    if (lastConState.webSocket !== nextConState.webSocket) {
      this.unbindConnectionEvents(lastConState.webSocket)
      this.bindConnectionEvents(nextConState.webSocket)
    }

    // Once a peer identity has been set, it must stay the same
    if (this.state.identity !== null && nextState.identity !== this.state.identity) {
      throw new Error(
        `Attempted to change state.identity from ${this.state.identity} to ${String(
          nextState.identity,
        )}`,
      )
    }

    // Transition the state
    const prevState = this._state
    this._state = nextState

    // Perform post-transition actions
    if (prevState.type !== 'CONNECTED' && this.state.type === 'CONNECTED') {
      this._error = null
    }

    if (prevState.type !== nextState.type) {
      this.logger.debug(
        `${colors.green('PEER')} ${this.displayName} STATE ${prevState.type} -> ${
          this._state.type
        }`,
      )
    }

    this.onStateChanged.emit({ peer: this, state: nextState, prevState })
  }

  /**
   * Set the peer's state to DISCONNECTED, closing open connections.
   */
  close(error?: Readonly<unknown>): void {
    const connections = this.getConnectionStateOrDefault(this.state)
    connections.webRtc && this.removeConnection(connections.webRtc).close(error)
    connections.webSocket && this.removeConnection(connections.webSocket).close(error)

    if (error !== undefined) {
      this._error = error
    }
    this.setState(undefined, undefined)
  }

  /**
   * Clean up all resources managed by the peer.
   */
  dispose(): void {
    this.onStateChanged.clearAfter()
    this.onMessage.clearAfter()
    this.onBanned.clear()
    this.disposeMessageMeter()
  }

  punish(score: number, reason?: string): boolean {
    this.banScore += score

    if (this.banScore < this.maxBanScore) {
      return false
    }

    this.logger.info(`Peer ${this.displayName} has been banned: ${reason || 'UNKNOWN'}`)
    this.onBanned.emit(reason || 'UNKNOWN')
    this.close(new Error(`BANNED: ${reason || 'UNKNOWN'}`))
    return true
  }

  pushLoggedMessage(loggedMessage: LoggedMessage, forceLogMessage = false): void {
    if (!this.shouldLogMessages) {
      return
    }

    const { message } = loggedMessage
    if (forceLogMessage || !UNLOGGED_MESSAGE_TYPES.includes(message.type)) {
      this.loggedMessages.push(loggedMessage)
    }
  }
}
