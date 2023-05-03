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

export type GetPeersRequest =
  | undefined
  | {
      stream?: boolean
      filter?: {
        host?: string
        port?: number
      }
    }

export type GetPeersResponse = {
  peers: Array<PeerResponse>
}

export const GetPeersRequestSchema: yup.ObjectSchema<GetPeersRequest> = yup
  .object({
    stream: yup.boolean().optional(),
    filter: yup
      .object({
        host: yup.string().optional(),
        port: yup.number().optional(),
      })
      .optional(),
  })
  .optional()
  .default({})

export const GetPeersResponseSchema: yup.ObjectSchema<GetPeersResponse> = yup
  .object({
    peers: yup.array(PeerResponseSchema.defined()).defined(),
  })
  .defined()

router.register<typeof GetPeersRequestSchema, GetPeersResponse>(
  `${ApiNamespace.peer}/getPeers`,
  GetPeersRequestSchema,
  (request, node): void => {
    const peerNetwork = node.peerNetwork

    if (!peerNetwork) {
      request.end({ peers: [] })
      return
    }

    const peers = getPeers(peerNetwork, request.data?.filter)

    if (!request.data?.stream) {
      request.end({ peers })
      return
    }

    request.stream({ peers })

    const interval = setInterval(() => {
      const peers = getPeers(peerNetwork, request.data?.filter)
      request.stream({ peers })
    }, 1000)

    request.onClose.on(() => {
      clearInterval(interval)
    })
  },
)

function getPeers(
  network: PeerNetwork,
  filter?: {
    host?: string
    port?: number
  },
): PeerResponse[] {
  const result: PeerResponse[] = []

  for (const peer of network.peerManager.peers) {
    const matchesHost = !filter?.host || !!peer.address?.includes(filter.host)
    const matchesPort = !filter?.port || peer.port === filter.port

    if (!matchesHost || !matchesPort) {
      continue
    }

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

    result.push({
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
    })
  }

  return result
}
