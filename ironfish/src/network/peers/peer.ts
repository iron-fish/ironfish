/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import colors from 'colors/safe'
import { Event } from '../../event'
import { createRootLogger, Logger } from '../../logger'
import { ErrorUtils } from '../../utils'
import { Identity } from '../identity'
import { DisconnectingReason, InternalMessageType, LooseMessage } from '../messages'
import { ConnectionRetry } from './connectionRetry'
import { WebRtcConnection, WebSocketConnection } from './connections'
import { Connection, ConnectionDirection, ConnectionType } from './connections/connection'

export enum BAN_SCORE {
  NO = 0,
  LOW = 1,
  MED = 5,
  MAX = 10,
}

/**
 * Message types that should be excluded from loggedMessages (unless overridden).
 */
const UNLOGGED_MESSAGE_TYPES: ReadonlyArray<string> = [
  InternalMessageType.peerList,
  InternalMessageType.signal,
]

type LoggedMessage = {
  brokeringPeerDisplayName?: string
  direction: 'send' | 'receive'
  message: LooseMessage
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

export class Peer {
  readonly pendingRPCMax: number
  readonly logger: Logger

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
   * The peers protocol version
   */
  version: number | null = null
  /**
   * The peers agent
   */
  agent: string | null = null
  /**
   * The peers heaviest head hash
   */
  head: Buffer | null = null
  /**
   * The peers heaviest head cumulative work
   */
  work: bigint | null = null
  /**
   * The peers heaviest head sequence
   */
  sequence: number | null = null
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
   * Is the peer a node we will always attempt to connect to
   */
  isWhitelisted = false

  /**
   * address associated with this peer
   */
  private _address: string | null = null
  get address(): string | null {
    return this._address
  }

  /**
   * port associated with this peer
   */
  private _port: number | null = null
  get port(): number | null {
    return this._port
  }

  /** how many outbound connections does the peer have */
  pendingRPC = 0

  /**
   * A map of peers connected to this peer, shared by the PeerList message.
   */
  knownPeers: Map<Identity, Peer> = new Map<Identity, Peer>()

  private readonly supportedConnections: {
    [ConnectionType.WebSocket]: ConnectionRetry
    [ConnectionType.WebRtc]: ConnectionRetry
  } = {
    WebRtc: new ConnectionRetry(),
    WebSocket: new ConnectionRetry(),
  }

  /**
   * The reason why the Peer requested to disconnect from us.
   */
  peerRequestedDisconnectReason: DisconnectingReason | null = null

  /**
   * UTC timestamp. If set, the peer manager should not initiate connections to the
   * Peer until after the timestamp.
   */
  peerRequestedDisconnectUntil: number | null = null

  /**
   * The reason why we requested the Peer not to connect to us.
   */
  localRequestedDisconnectReason: DisconnectingReason | null = null

  /**
   * UTC timestamp. If set, the peer manager should not accept connections from the
   * Peer until after the timestamp.
   */
  localRequestedDisconnectUntil: number | null = null

  shouldLogMessages = false

  loggedMessages: Array<LoggedMessage> = []

  /**
   * Event fired for every new incoming message that needs to be processed
   * by the application layer. Includes the connection from which the message
   * was received.
   */
  readonly onMessage: Event<[LooseMessage, Connection]> = new Event()

  /**
   * Event fired when the knownPeers map changes.
   */
  readonly onKnownPeersChanged: Event<[]> = new Event()

  /**
   * Fired when the peer should be banned
   */
  readonly onBanned: Event<[]> = new Event()

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
    }: {
      logger?: Logger
      maxPending?: number
      maxBanScore?: number
      shouldLogMessages?: boolean
    } = {},
  ) {
    this.logger = logger.withTag('Peer')
    this.pendingRPCMax = maxPending
    this.maxBanScore = maxBanScore
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

    this.setState(this.computeStateFromConnections(webSocket, connection))
  }

  /**
   * Sets a WebSocket connection on the peer, moving it into the CONNECTING state if necessary.
   * Ignores the connection if the peer already has a WebSocket connection.
   * @param connection The WebSocket connection to set
   */
  setWebSocketConnection(connection: WebSocketConnection): void {
    if (this.state.type !== 'DISCONNECTED' && this.state.connections.webSocket) {
      this.logger.debug('Already have a WebSocket connection, ignoring the new one')
      return
    }

    const webRtc =
      this.state.type !== 'DISCONNECTED' ? this.state.connections.webRtc : undefined

    this.setState(this.computeStateFromConnections(connection, webRtc))
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

    this.setState(this.computeStateFromConnections(wsConnection, webRtcConnection))

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
   * Get the peers connectable websocket address
   */
  getWebSocketAddress(includeProtocol = true): string {
    let address = ''

    if (includeProtocol) {
      address = 'ws://' + address
    }

    if (this.address) {
      address += this.address
    }

    if (this.port) {
      address = address + ':' + String(this.port)
    }

    return address
  }

  /**
   * Sets the address and peer by which the peer can be connected to over WebSockets.
   * Setting address and port to null makes a peer unconnectable via WebSocket outbound connections.
   * @param address Hostname of the address, or null to remove the address.
   * @param port Port to connect over. Must be null if address is null.
   */
  setWebSocketAddress(address: string | null, port: number | null): void {
    if (address === null && port !== null) {
      throw new Error(
        `Called setWebSocketAddress on ${String(
          this.state.identity,
        )} with a port but no address`,
      )
    }

    // Don't do anything if the address and port stay the same
    if (address === this._address && port === this._port) {
      return
    }

    this._address = address
    this._port = port

    if (address === null && port === null) {
      this.getConnectionRetry(
        ConnectionType.WebSocket,
        ConnectionDirection.Outbound,
      )?.neverRetryConnecting()
    } else {
      // Reset ConnectionRetry since some component of the address changed
      this.getConnectionRetry(
        ConnectionType.WebSocket,
        ConnectionDirection.Outbound,
      )?.successfulConnection()
    }
  }

  /**
   * Sends a message over the peer's connection if CONNECTED, else drops it.
   * @param message The message to send.
   */
  send(message: LooseMessage): Connection | null {
    // Return early if peer is not in state CONNECTED
    if (this.state.type !== 'CONNECTED') {
      this.logger.debug(
        `Attempted to send a ${message.type} message to ${this.displayName} in state ${this.state.type}`,
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
          message: message,
          timestamp: Date.now(),
          type: ConnectionType.WebRtc,
        })
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
          message: message,
          timestamp: Date.now(),
          type: ConnectionType.WebSocket,
        })
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

  getConnectionRetry(type: ConnectionType, direction: ConnectionDirection.Inbound): null
  getConnectionRetry(
    type: ConnectionType,
    direction: ConnectionDirection.Outbound,
  ): ConnectionRetry
  getConnectionRetry(
    type: ConnectionType,
    direction: ConnectionDirection,
  ): ConnectionRetry | null
  getConnectionRetry(
    type: ConnectionType,
    direction: ConnectionDirection,
  ): ConnectionRetry | null {
    if (direction === ConnectionDirection.Inbound) {
      return null
    }
    return this.supportedConnections[type]
  }

  private readonly connectionMessageHandlers: Map<Connection, (message: LooseMessage) => void> =
    new Map<Connection, (message: LooseMessage) => void>()

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

    if (connection.state.type === 'CONNECTED') {
      this.getConnectionRetry(connection.type, connection.direction)?.successfulConnection()
      if (connection instanceof WebSocketConnection && connection.hostname) {
        this.setWebSocketAddress(connection.hostname, connection.port || null)
      }
    }

    // onMessage
    if (!this.connectionMessageHandlers.has(connection)) {
      const messageHandler = (message: LooseMessage) => {
        this.pushLoggedMessage({
          direction: 'receive',
          message: message,
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
            `Connection closing ${connection.type} for ${this.displayName}:`,
            ErrorUtils.renderError(connection.error) || 'Reason Unknown',
          )

          if (connection.error !== null) {
            this._error = connection.error
            this.getConnectionRetry(connection.type, connection.direction)?.failedConnection(
              this.isWhitelisted,
            )
          }

          this.removeConnection(connection)
          return
        }

        if (connection.state.type === 'CONNECTED') {
          // If connection goes to connected, transition the peer to connected
          this.getConnectionRetry(connection.type, connection.direction)?.successfulConnection()
          if (connection instanceof WebSocketConnection && connection.hostname) {
            this.setWebSocketAddress(connection.hostname, connection.port || null)
          }
          this.setState(
            this.computeStateFromConnections(
              this.state.connections.webSocket,
              this.state.connections.webRtc,
            ),
          )
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
  private setState(nextState: PeerState): void {
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
    this.setState({ type: 'DISCONNECTED', identity: this.state.identity })
  }

  /**
   * Clean up all resources managed by the peer.
   */
  dispose(): void {
    this.onStateChanged.clear()
    this.onKnownPeersChanged.clear()
    this.onMessage.clear()
    this.onBanned.clear()
  }

  punish(score: number, reason?: string): boolean {
    this.banScore += score

    if (this.banScore < this.maxBanScore) {
      return false
    }

    this.logger.info(`Peer ${this.displayName} has been banned: ${reason || 'UNKNOWN'}`)
    this.close(new Error(`BANNED: ${reason || 'UNKNOWN'}`))
    this.onBanned.emit()
    return true
  }

  pushLoggedMessage(loggedMessage: LoggedMessage, forceLogMessage = false): void {
    if (!this.shouldLogMessages) {
      return
    }

    if (forceLogMessage || !UNLOGGED_MESSAGE_TYPES.includes(loggedMessage.message.type)) {
      this.loggedMessages.push(loggedMessage)
    }
  }
}
