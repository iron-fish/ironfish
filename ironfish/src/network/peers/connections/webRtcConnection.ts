/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import SimplePeer, { SignalData } from 'simple-peer'
import { Event } from '../../../event'
import type { Logger } from '../../../logger'
import { LooseMessage, parseMessage } from '../../messages'
import { Connection, ConnectionDirection, ConnectionType } from './connection'
import { NetworkError } from './errors'
import { IsomorphicWebRtc } from '../../types'
import { MetricsMonitor } from '../../../metrics'
import colors from 'colors/safe'

/**
 * Light wrapper of WebRtc SimplePeer that knows how to send and receive
 * LooseMessages instead of strings/data.
 */
export class WebRtcConnection extends Connection {
  private readonly peer: SimplePeer.Instance

  /**
   * Event fired when the peer wants to signal its remote peer that an offer,
   * answer, or ice candidate is available
   */
  onSignal = new Event<[SignalData]>()

  constructor(
    initiator: boolean,
    wrtc: IsomorphicWebRtc,
    logger: Logger,
    metrics?: MetricsMonitor,
    options: { simulateLatency?: number } = {},
  ) {
    super(
      ConnectionType.WebRtc,
      initiator ? ConnectionDirection.Outbound : ConnectionDirection.Inbound,
      logger.withTag('webrtcconnection'),
      metrics,
      options,
    )

    if (this.simulateLatency) {
      this.addLatencyWrapper()
    }

    // TODO: This is using google STUN internally, we need to
    // make it use any of the websocket peers
    this.peer = new SimplePeer({ initiator, wrtc })

    this.peer.on('close', () => {
      this.setState({ type: 'DISCONNECTED' })
    })

    this.peer.on('error', (error: Error) => {
      this._error = error
      this.setState({ type: 'DISCONNECTED' })
    })

    this.peer.on('connect', () => {
      if (this.state.type !== 'WAITING_FOR_IDENTITY' && this.state.type !== 'CONNECTED') {
        this.setState({ type: 'WAITING_FOR_IDENTITY' })
      }
    })

    this.peer.on('signal', (signal: SignalData) => {
      if (this.state.type !== 'CONNECTED' && this.state.type !== 'WAITING_FOR_IDENTITY') {
        this.setState({ type: 'SIGNALING' })
      }

      this.onSignal.emit(signal)
    })

    this.peer.on('data', (data: string | Uint8Array) => {
      // simple-peer will sometimes emit data before emitting 'connect', so
      // make sure the connection state is updated
      if (this.state.type === 'SIGNALING') {
        this.setState({ type: 'WAITING_FOR_IDENTITY' })
        this.logger.debug(
          'Received data before WebRTC connect event fired, setting peer to WAITING_FOR_IDENTITY',
        )
      }

      let stringdata
      if (data instanceof Uint8Array) {
        stringdata = new TextDecoder().decode(data)
      } else stringdata = data

      // TODO: Switch network traffic to binary only so this can measure bytes and then decode the binary into JSON
      const byteCount = Buffer.from(stringdata).byteLength
      this.metrics?.p2p_InboundTraffic.add(byteCount)
      this.metrics?.p2p_InboundTraffic_WebRTC.add(byteCount)

      let message
      try {
        message = parseMessage(stringdata)
      } catch (error) {
        this.logger.warn('Unable to parse webrtc message', stringdata)
        this.peer.destroy()
        return
      }

      if (this.shouldLogMessageType(message.type)) {
        this.logger.debug(`${colors.yellow('RECV')} ${this.displayName}: ${message.type}`)
      }

      this.onMessage.emit(message)
    })
  }

  /**
   * Inject a signal from the peer during the connection negotiation phase
   */
  signal(data: SignalData): void {
    try {
      if (this.state.type === 'DISCONNECTED' || this.state.type === 'CONNECTING') {
        this.setState({ type: 'SIGNALING' })
      }
      this.peer.signal(data)
    } catch (error) {
      const message = 'An error occurred when loading signaling data:'
      this.logger.debug(message, error)
      this.close(new NetworkError(message, error))
    }
  }

  /**
   * Encode the message to json and send it to the peer
   */
  send = (message: LooseMessage): boolean => {
    if (this.shouldLogMessageType(message.type)) {
      this.logger.debug(`${colors.yellow('SEND')} ${this.displayName}: ${message.type}`)
    }

    const data = JSON.stringify(message)
    try {
      this.peer.send(data)
    } catch (e) {
      this.logger.debug(
        `Error occurred while sending ${message.type} message in state ${this.state.type}`,
        e,
      )
      this.close(e)
      return false
    }

    // TODO: Switch network traffic to binary
    const byteCount = Buffer.from(data).byteLength
    this.metrics?.p2p_OutboundTraffic.add(byteCount)
    this.metrics?.p2p_OutboundTraffic_WebRTC.add(byteCount)

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
    this.peer.destroy()
  }
}
