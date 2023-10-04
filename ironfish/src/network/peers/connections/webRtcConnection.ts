/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { Logger } from '../../../logger'
import colors from 'colors/safe'
import nodeDataChannel from 'node-datachannel'
import { Assert } from '../../../assert'
import { Event } from '../../../event'
import { MetricsMonitor } from '../../../metrics'
import { ErrorUtils } from '../../../utils'
import { parseNetworkMessage } from '../../messageRegistry'
import { displayNetworkMessageType } from '../../messages/networkMessage'
import { MAX_MESSAGE_SIZE } from '../../version'
import { Connection, ConnectionDirection, ConnectionType } from './connection'
import { NetworkError } from './errors'

export type SignalData =
  | {
      type: nodeDataChannel.DescriptionType
      sdp: string
    }
  | CandidateSignal

type CandidateSignal = {
  type: 'candidate'
  candidate: {
    candidate: string
    sdpMid: string
    sdpMLineIndex: number
  }
}

/**
 * Light wrapper of node-datachannel that knows how to send and receive
 * LooseMessages instead of strings/data.
 */
export class WebRtcConnection extends Connection {
  private readonly peer: nodeDataChannel.PeerConnection
  private datachannel: nodeDataChannel.DataChannel | null = null

  /**
   * True if we've received an SDP message from the peer.
   */
  private receivedDescription = false

  /**
   * Queue for ICE candidates until we've received an SDP message from the peer.
   */
  private candidateQueue: CandidateSignal[] = []

  /**
   * Event fired when the PeerConnection has an SDP message or ICE candidate to send to
   * the remote peer.
   */
  onSignal = new Event<[SignalData]>()

  constructor(
    initiator: boolean,
    logger: Logger,
    metrics?: MetricsMonitor,
    options: { stunServers?: string[] } = {},
  ) {
    super(
      ConnectionType.WebRtc,
      initiator ? ConnectionDirection.Outbound : ConnectionDirection.Inbound,
      logger.withTag('webrtcconnection'),
      metrics,
    )

    this.peer = new nodeDataChannel.PeerConnection('peer', {
      iceServers: options.stunServers ?? [],
      maxMessageSize: MAX_MESSAGE_SIZE,
    })

    this.setState({ type: 'CONNECTING' })

    this.peer.onLocalDescription((sdp, type) => {
      // The TypeScript types for "type" in this callback might not be accurate.
      // They should be https://www.w3.org/TR/webrtc/#dom-rtcsdptype

      if (this.state.type !== 'CONNECTED' && this.state.type !== 'WAITING_FOR_IDENTITY') {
        this.setState({ type: 'SIGNALING' })
      }

      this.onSignal.emit({ type, sdp })
    })

    this.peer.onLocalCandidate((candidate, mid) => {
      if (this.state.type !== 'CONNECTED' && this.state.type !== 'WAITING_FOR_IDENTITY') {
        this.setState({ type: 'SIGNALING' })
      }

      this.onSignal.emit({
        type: 'candidate',
        candidate: {
          candidate: candidate,
          sdpMid: mid,
          // sdpMLineIndex isn't used by node-datachannel, but helps compatibility
          // with node-webrtc (and probably browser WebRTC)
          sdpMLineIndex: 0,
        },
      })
    })

    this.peer.onDataChannel((dc: nodeDataChannel.DataChannel) => {
      Assert.isNull(this.datachannel)
      this.initializeDataChannel(dc)
    })

    if (initiator) {
      this.initializeDataChannel(this.peer.createDataChannel(''))
    }
  }

  initializeDataChannel(dc: nodeDataChannel.DataChannel): void {
    this.datachannel = dc

    this.datachannel.onOpen(() => {
      if (this.state.type !== 'WAITING_FOR_IDENTITY' && this.state.type !== 'CONNECTED') {
        this.setState({ type: 'WAITING_FOR_IDENTITY' })
      }
    })

    this.datachannel.onError((e) => {
      this.close(new NetworkError(e))
    })

    this.datachannel.onClosed(() => {
      this.close()
    })

    this.datachannel.onMessage((data: string | Uint8Array) => {
      const bufferData = Buffer.from(data)
      const byteCount = bufferData.byteLength
      this.metrics?.p2p_InboundTraffic.add(byteCount)
      this.metrics?.p2p_InboundTraffic_WebRTC.add(byteCount)

      let message
      try {
        message = parseNetworkMessage(bufferData)
      } catch (error) {
        this.logger.warn(`Unable to parse webrtc message`)
        this.close(error)
        return
      }
      this.metrics?.p2p_InboundTrafficByMessage.get(message.type)?.add(byteCount)

      if (this.shouldLogMessageType(message.type)) {
        this.logger.debug(
          `${colors.yellow('RECV')} ${this.displayName}: ${displayNetworkMessageType(
            message.type,
          )}`,
        )
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

      if (data.type === 'candidate') {
        if (this.receivedDescription) {
          this.peer.addRemoteCandidate(data.candidate.candidate, data.candidate.sdpMid)
        } else {
          this.candidateQueue.push(data)
        }
      } else {
        this.peer.setRemoteDescription(data.sdp, data.type)
        this.receivedDescription = true

        while (this.candidateQueue.length > 0) {
          const data = this.candidateQueue.shift()
          if (data) {
            this.peer.addRemoteCandidate(data.candidate.candidate, data.candidate.sdpMid)
          }
        }
      }
    } catch (error) {
      const err = new NetworkError('An error occurred when loading signaling data', error)
      this.logger.debug(ErrorUtils.renderError(err))
      this.close(err)
    }
  }

  _send = (data: Buffer): boolean => {
    if (!this.datachannel) {
      return false
    }

    if (!this.datachannel.isOpen()) {
      this.logger.debug('Datachannel no longer open, closing connection')
      this.close()
      return false
    }

    this.datachannel.sendMessageBinary(data)

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

    this.datachannel?.close()

    try {
      this.peer.destroy()
    } catch (e) {
      // peer.destroy() may throw "It seems peer-connection is closed" if the
      // peer connection has been disposed already
    }
    this.datachannel = null
  }
}
