/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { Logger } from '../../../logger'
import colors from 'colors/safe'
import { Assert } from '../../../assert'
import { Event } from '../../../event'
import { MetricsMonitor } from '../../../metrics'
import { ErrorUtils, SetTimeoutToken } from '../../../utils'
import { Identity } from '../../identity'
import { displayNetworkMessageType, NetworkMessage } from '../../messages/networkMessage'
import { RPC_TIMEOUT_MILLIS } from '../../messages/rpcNetworkMessage'
import { NetworkMessageType } from '../../types'
import { MAX_MESSAGE_SIZE } from '../../version'
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
   * Event fired when a new message comes in.
   */
  readonly onMessage: Event<[NetworkMessage]> = new Event()

  /**
   * Send a message into this connection.
   */
  abstract _send: (data: Buffer) => boolean

  /**
   * Shutdown the connection, if possible
   */
  abstract readonly close: (error?: unknown) => void

  constructor(
    type: ConnectionType,
    direction: ConnectionDirection,
    logger: Logger,
    metrics?: MetricsMonitor,
  ) {
    this.type = type
    this.direction = direction
    this.logger = logger
    this.metrics = metrics || null
    this._error = null
  }

  send(object: NetworkMessage): boolean {
    const data = object.serialize()
    const byteCount = data.byteLength

    if (byteCount >= MAX_MESSAGE_SIZE) {
      this.logger.warn(
        `Attempted to send a message that exceeds the maximum size. ${object.type} (${byteCount})`,
      )
      return false
    }

    if (this.shouldLogMessageType(object.type)) {
      this.logger.debug(
        `${colors.yellow('SEND')} ${this.displayName}: ${displayNetworkMessageType(
          object.type,
        )}`,
      )
    }

    let sendResult
    try {
      sendResult = this._send(data)
    } catch (e) {
      this.logger.debug(
        `Error occurred while sending ${displayNetworkMessageType(
          object.type,
        )} message in state ${this.state.type} ${ErrorUtils.renderError(e)}`,
      )
      this.close(e)
      return false
    }

    if (sendResult) {
      this.metrics?.p2p_OutboundTraffic.add(byteCount)
      this.metrics?.p2p_OutboundTrafficByMessage.get(object.type)?.add(byteCount)

      if (this.type === ConnectionType.WebRtc) {
        this.metrics?.p2p_OutboundTraffic_WebRTC.add(byteCount)
      } else if (this.type === ConnectionType.WebSocket) {
        this.metrics?.p2p_OutboundTraffic_WS.add(byteCount)
      } else {
        Assert.isUnreachable(this.type)
      }
    }

    return sendResult
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
        const timeout = RPC_TIMEOUT_MILLIS

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

  shouldLogMessageType(messageType: NetworkMessageType): boolean {
    const bannedMessageTypes = [NetworkMessageType.PeerList, NetworkMessageType.Signal]
    return !bannedMessageTypes.includes(messageType)
  }
}
