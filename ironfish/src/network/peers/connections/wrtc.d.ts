/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

declare module 'wrtc' {
  // TODO: node-webrtc is supposed to be spec-compliant, but the
  // typescript types may not match the browser implementations.
  export const MediaStream: MediaStream
  export const MediaStreamTrack: MediaStreamTrack
  export const RTCDataChannel: RTCDataChannel
  export const RTCDataChannelEvent: RTCDataChannelEvent
  export const RTCDtlsTransport: RTCDtlsTransport
  export const RTCIceCandidate: RTCIceCandidate
  export const RTCIceTransport: RTCIceTransport
  export const RTCPeerConnection: RTCPeerConnection
  export const RTCPeerConnectionIceEvent: RTCPeerConnectionIceEvent
  export const RTCRtpReceiver: RTCRtpReceiver
  export const RTCRtpSender: RTCRtpSender
  export const RTCRtpTransceiver: RTCRtpTransceiver
  export const RTCSctpTransport: RTCSctpTransport
  export const RTCSessionDescription: RTCSessionDescription
  export const getUserMedia: (constraints?: MediaStreamConstraints) => Promise<MediaStream>
  export const mediaDevices: MediaDevices
}
