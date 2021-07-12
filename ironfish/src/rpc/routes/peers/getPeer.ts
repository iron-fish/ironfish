/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Connection, PeerNetwork } from '../../../network'
import { ApiNamespace, router } from '../router'
import { PeerResponse } from './getPeers'

type ConnectionState = Connection['state']['type'] | ''

export type GetPeerRequest = {
  identity: string
  stream?: boolean
}

export type GetPeerResponse = {
  peer: PeerResponse | null
}

export const GetPeerRequestSchema: yup.ObjectSchema<GetPeerRequest> = yup
  .object({
    identity: yup.string().defined(),
    stream: yup.boolean().optional(),
  })
  .defined()

export const GetPeerResponseSchema: yup.ObjectSchema<GetPeerResponse> = yup
  .object({
    peer: yup
      .object({
        state: yup.string().defined(),
        address: yup.string().nullable().defined(),
        port: yup.number().nullable().defined(),
        identity: yup.string().nullable().defined(),
        name: yup.string().nullable().defined(),
        head: yup.string().nullable().defined(),
        work: yup.string().nullable().defined(),
        sequence: yup.number().nullable().defined(),
        version: yup.number().nullable().defined(),
        agent: yup.string().nullable().defined(),
        error: yup.string().nullable().defined(),
        connections: yup.number().defined(),
        connectionWebSocket: yup.string<ConnectionState>().defined(),
        connectionWebSocketError: yup.string().defined(),
        connectionWebRTC: yup.string<ConnectionState>().defined(),
        connectionWebRTCError: yup.string().defined(),
      })
      .defined(),
  })
  .defined()

router.register<typeof GetPeerRequestSchema, GetPeerResponse>(
  `${ApiNamespace.peer}/getPeer`,
  GetPeerRequestSchema,
  (request, node): void => {
    const peerNetwork = node.peerNetwork

    if (!peerNetwork) {
      request.end({ peer: null })
      return
    }

    const peer = getPeer(peerNetwork, request.data.identity)

    if (!request.data.stream) {
      request.end({ peer })
      return
    }

    request.stream({ peer })

    const interval = setInterval(() => {
      const peer = getPeer(peerNetwork, request.data.identity)
      request.stream({ peer })
    }, 1000)

    request.onClose.on(() => {
      clearInterval(interval)
    })
  },
)

function getPeer(network: PeerNetwork, identity: string): PeerResponse | null {
  for (const peer of network.peerManager.peers) {
    if (peer.state.identity !== null && peer.state.identity.includes(identity)) {
      let connections = 0
      let connectionWebRTC: ConnectionState = ''
      let connectionWebSocket: ConnectionState = ''
      let connectionWebRTCError = ''
      let connectionWebSocketError = ''

      if (peer.state.type !== 'DISCONNECTED') {
        if (peer.state.connections.webSocket) {
          connectionWebSocket = peer.state.connections.webSocket.state.type
          connectionWebSocketError = String(peer.state.connections.webSocket.error || '')
        }

        if (peer.state.connections.webRtc) {
          connectionWebRTC = peer.state.connections.webRtc.state.type
          connectionWebRTCError = String(peer.state.connections.webRtc.error || '')
        }
      }

      if (connectionWebSocket !== '') {
        connections++
      }
      if (connectionWebRTC !== '') {
        connections++
      }

      return {
        state: peer.state.type,
        address: peer.address,
        port: peer.port,
        identity: peer.state.identity,
        name: peer.name,
        version: peer.version,
        agent: peer.agent,
        head: peer.head?.toString('hex') || null,
        work: String(peer.work),
        sequence: peer.sequence !== null ? Number(peer.sequence) : null,
        connections: connections,
        error: peer.error !== null ? String(peer.error) : null,
        connectionWebSocket: connectionWebSocket,
        connectionWebSocketError: connectionWebSocketError,
        connectionWebRTC: connectionWebRTC,
        connectionWebRTCError: connectionWebRTCError,
      }
    }
  }

  return null
}
