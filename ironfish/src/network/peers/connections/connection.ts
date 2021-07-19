/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { Logger } from '../../../logger'
import colors from 'colors/safe'
import { Event } from '../../../event'
import { MetricsMonitor } from '../../../metrics'
import { SetTimeoutToken } from '../../../utils'
import { Identity } from '../../identity'
import { rpcTimeoutMillis } from '../../messageRouters/rpcId'
import { InternalMessageType, LooseMessage } from '../../messages'
import { HandshakeTimeoutError } from './errors'

/**
 * The type of peer connection. This should only be used for information
 * reporting purposes. Switching on the type indicates an api design flaw,
 * as peers should generally behave identically once connected.
 */
export enum ConnectionType {
  WebSocket = 'WebSocket',
  WebRtc = 'WebRtc',
}

export enum ConnectionDirection {
  Inbound = 'Inbound',
  Outbound = 'Outbound',
}

type ConnectionState =
  | { type: 'DISCONNECTED' }
  | { type: 'CONNECTING' }
  /* A WebRTC-exclusive state that requires an identity */
  | { type: 'REQUEST_SIGNALING' }
  /* A WebRTC-exclusive state that requires an identity */
  | { type: 'SIGNALING' }
  | { type: 'WAITING_FOR_IDENTITY' }
  | { type: 'CONNECTED'; identity: Identity }

/**
 * Model any connection that can send and receive messages.
 */
export abstract class Connection {
  readonly logger: Logger
  readonly metrics: MetricsMonitor | null
  readonly type: ConnectionType
  readonly direction: ConnectionDirection
  private handshakeTimeout: SetTimeoutToken | null = null

  /**
   * If set will simulate a random amount of latency up to this number
   */
  protected readonly simulateLatency: number = 0
  protected readonly simulateLatencyQueue: Array<LooseMessage>

  /**
   * The last error received (if any), regardless of the current state of the connection.
   */
  protected _error: unknown | null
  get error(): Readonly<unknown> | null {
    return this._error as Readonly<unknown>
  }

  /**
   * Indicates the current state of the connection.
   */
  private _state: Readonly<ConnectionState> = { type: 'DISCONNECTED' }
  get state(): Readonly<ConnectionState> {
    return this._state
  }

  /**
   * The loggable name of the connection.
   */
  get displayName(): string {
    const name =
      this.state.type === 'CONNECTED' ? this.state.identity.slice(0, 7) : 'unidentified'
    return `${this.type} ${name}`
  }

  /**
   * Event fired when the state of the connection changes.
   */
  readonly onStateChanged: Event<[]> = new Event()

  /**
   * Event fired when a new message comes in. The data is converted to a
   * json obj and verifies that it has a type attribute before being passed
   * in.
   */
  readonly onMessage: Event<[LooseMessage]> = new Event()

  /**
   * Send a message into this connection.
   */
  abstract send: (object: LooseMessage) => boolean

  /**
   * Shutdown the connection, if possible
   */
  abstract readonly close: (error?: unknown) => void

  constructor(
    type: ConnectionType,
    direction: ConnectionDirection,
    logger: Logger,
    metrics?: MetricsMonitor,
    options: { simulateLatency?: number } = {},
  ) {
    this.type = type
    this.direction = direction
    this.logger = logger
    this.metrics = metrics || null
    this._error = null
    this.simulateLatency = options.simulateLatency || 0
    this.simulateLatencyQueue = []
  }

  setState(state: Readonly<ConnectionState>): void {
    const prevState = this._state
    this._state = state

    if (prevState.type !== state.type) {
      if (this.handshakeTimeout) {
        // Clear handshakeTimeout because were changing state
        // and we have a timeout per handshake phase or were
        // done doing the handshake
        clearTimeout(this.handshakeTimeout)
        this.handshakeTimeout = null
      }

      if (
        state.type === 'CONNECTING' ||
        state.type === 'REQUEST_SIGNALING' ||
        state.type === 'SIGNALING' ||
        state.type === 'WAITING_FOR_IDENTITY'
      ) {
        const timeout = rpcTimeoutMillis()

        this.handshakeTimeout = setTimeout(() => {
          const error = `Closing ${this.type} connection because handshake timed out in state ${state.type} after ${timeout}ms`
          this.logger.debug(error)
          this.close(new HandshakeTimeoutError(state.type, timeout, error))
        }, timeout)
      }

      if (state.type === 'CONNECTED') {
        this._error = null
      }

      this.logger.debug(
        `${colors.green('CONN')} ${this.displayName} STATE ${prevState.type} -> ${state.type}`,
      )
    }

    this.onStateChanged.emit()
  }

  /**
   * Replaces the connection.send() function with one that randomly delays outbound messages
   */
  protected addLatencyWrapper(): void {
    if (!this.simulateLatency) {
      return
    }
    const originalSend = this.send

    const wrapper = (
      ...args: Parameters<typeof originalSend>
    ): ReturnType<typeof originalSend> => {
      const message: LooseMessage = args[0]
      this.simulateLatencyQueue.push(message)

      let latency = Math.random() * (this.simulateLatency || 0)
      if (args[0].type === InternalMessageType.disconnecting) {
        latency = 0
      }

      setTimeout(() => {
        const toSend = this.simulateLatencyQueue.shift()
        if (this.state.type !== 'DISCONNECTED' && toSend) {
          originalSend(toSend)
        }
      }, latency)

      // TODO: Not currently possible to propagate connection errors from sending
      return true
    }

    this.send = wrapper
  }

  shouldLogMessageType(messageType: string): boolean {
    const bannedMessageTypes = [
      InternalMessageType.peerList,
      InternalMessageType.signal,
    ] as string[]
    return !bannedMessageTypes.includes(messageType)
  }
}
