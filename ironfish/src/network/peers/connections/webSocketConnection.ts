/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { Logger } from '../../../logger'
import colors from 'colors/safe'
import { MetricsMonitor } from '../../../metrics'
import { parseNetworkMessage } from '../../messageRegistry'
import { displayNetworkMessageType } from '../../messages/networkMessage'
import { IsomorphicWebSocket, IsomorphicWebSocketErrorEvent } from '../../types'
import { Connection, ConnectionDirection, ConnectionType } from './connection'
import { NetworkError } from './errors'

/**
 * Light wrapper of node+browser WebSockets that knows how to send and receive
 * LooseMessages instead of strings/data.
 */
export class WebSocketConnection extends Connection {
  private readonly socket: IsomorphicWebSocket

  // The hostname of the address that was used to establish the WebSocket connection, if any
  readonly hostname?: string

  // The port of the address that was used to establish the WebSocket connection, if any
  port?: number

  constructor(
    socket: IsomorphicWebSocket,
    direction: ConnectionDirection,
    logger: Logger,
    metrics?: MetricsMonitor,
    options: { hostname?: string; port?: number } = {},
  ) {
    super(ConnectionType.WebSocket, direction, logger.withTag('WebSocketConnection'), metrics)

    this.socket = socket
    this.hostname = options.hostname
    this.port = options.port

    if (this.socket.readyState === this.socket.OPEN) {
      this.setState({ type: 'WAITING_FOR_IDENTITY' })
    } else {
      this.setState({ type: 'CONNECTING' })
    }

    this.socket.onerror = (...args: unknown[]) => {
      // Browser WebSockets call onerror with (this, ErrorEvent), but the ws library
      // calls onerror with (ErrorEvent), so grab ErrorEvent in either case
      let error: IsomorphicWebSocketErrorEvent | null = null
      if (args.length === 1) {
        error = args[0] as IsomorphicWebSocketErrorEvent
      } else if (args.length === 2) {
        error = args[1] as IsomorphicWebSocketErrorEvent
      }

      this.close(new NetworkError(error?.message, error))
    }

    this.socket.onclose = () => {
      this.setState({ type: 'DISCONNECTED' })
    }

    this.socket.onopen = () => {
      this.setState({ type: 'WAITING_FOR_IDENTITY' })
    }

    this.socket.onmessage = (event: MessageEvent) => {
      if (!Buffer.isBuffer(event.data)) {
        const message = 'Received non-buffer message'
        this.logger.debug(message, event.data)
        this.close(new NetworkError(message))
        return
      }

      this.metrics?.p2p_InboundTraffic.add(event.data.byteLength)
      this.metrics?.p2p_InboundTraffic_WS.add(event.data.byteLength)

      let message

      try {
        message = parseNetworkMessage(event.data)

        this.metrics?.p2p_InboundTrafficByMessage.get(message.type)?.add(event.data.byteLength)
      } catch (error) {
        // TODO: any socket that sends invalid messages should probably
        // be punished with some kind of "downgrade" event. This should
        // probably happen at a higher layer of abstraction
        const message = 'Error parsing message'
        this.logger.warn(message)
        this.close(new NetworkError(message))
        return
      }

      if (this.shouldLogMessageType(message.type)) {
        this.logger.debug(
          `${colors.yellow('RECV')} ${this.displayName}: ${displayNetworkMessageType(
            message.type,
          )}`,
        )
      }

      this.onMessage.emit(message)
    }
  }

  _send = (data: Buffer): boolean => {
    this.socket.send(data)

    return true
  }

  /**
   * Close the connection
   */
  close = (error?: unknown): void => {
    if (error) {
      if (!(error instanceof Error)) {
        this.logger.warn(`Error in close() not an instance of Error: ${JSON.stringify(error)}`)
      }

      this._error = error
    }

    this.setState({ type: 'DISCONNECTED' })

    // Unbind event handlers, they can still fire with buffered inbound messages after
    // the socket is closed. onerror is intentionally left intact, since it will
    // trigger if a WebSocket is closed before the connection was established
    this.socket.onmessage = null
    this.socket.onclose = null
    this.socket.onopen = null

    this.socket.close()
  }
}
