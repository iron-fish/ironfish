/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { PeerNetwork } from '../../../network'
import { ApiNamespace, router } from '../router'
import {
  ConnectionState,
  createPeerCandidateResponse,
  PeerCandidateResponse,
  PeerResponse,
  PeerResponseSchema,
} from './types'

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
    peer: PeerResponseSchema.defined(),
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

      const alternateIdentity = peer.state.identity || peer.getWebSocketAddress()
      const peerCandidate = network.peerManager.peerCandidates.get(alternateIdentity)

      let candidate: PeerCandidateResponse | undefined
      if (peerCandidate) {
        candidate = createPeerCandidateResponse(peerCandidate)
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
        networkId: peer.networkId,
        genesisBlockHash: peer.genesisBlockHash?.toString('hex') || null,
        features: peer.features,
        candidate,
      }
    }
  }

  return null
}
