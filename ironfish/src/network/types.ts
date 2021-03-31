/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type WSWebSocket from 'ws'
import { ErrorEvent as WSErrorEvent } from 'ws'

export type IsomorphicWebSocketConstructor = typeof WebSocket | typeof WSWebSocket
export type IsomorphicWebSocket = WebSocket | WSWebSocket
export type IsomorphicWebSocketErrorEvent = WSErrorEvent

type WebRtcInterface = {
  MediaStream: MediaStream
  MediaStreamTrack: MediaStreamTrack
  RTCDataChannel: RTCDataChannel
  RTCDataChannelEvent: RTCDataChannelEvent
  RTCDtlsTransport: RTCDtlsTransport
  RTCIceCandidate: RTCIceCandidate
  RTCIceTransport: RTCIceTransport
  RTCPeerConnection: RTCPeerConnection
  RTCPeerConnectionIceEvent: RTCPeerConnectionIceEvent
  RTCRtpReceiver: RTCRtpReceiver
  RTCRtpSender: RTCRtpSender
  RTCRtpTransceiver: RTCRtpTransceiver
  RTCSctpTransport: RTCSctpTransport
  RTCSessionDescription: RTCSessionDescription
  getUserMedia: (constraints?: MediaStreamConstraints) => Promise<MediaStream>
  mediaDevices: MediaDevices
}

// if wrtc is undefined, simple-peer will use browser functions
export type IsomorphicWebRtc = WebRtcInterface | undefined
