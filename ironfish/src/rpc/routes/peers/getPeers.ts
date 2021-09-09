/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Connection, PeerNetwork } from '../../../network'
import { ApiNamespace, router } from '../router'

type ConnectionState = Connection['state']['type'] | ''

export type PeerResponse = {
  state: string
  identity: string | null
  version: number | null
  head: string | null
  sequence: number | null
  work: string | null
  agent: string | null
  name: string | null
  address: string | null
  port: number | null
  error: string | null
  connections: number
  connectionWebSocket: ConnectionState
  connectionWebSocketError: string
  connectionWebRTC: ConnectionState
  connectionWebRTCError: string
}

export type GetPeersRequest =
  | undefined
  | {
      stream?: boolean
    }

export type GetPeersResponse = {
  peers: Array<PeerResponse>
}

export const GetPeersRequestSchema: yup.ObjectSchema<GetPeersRequest> = yup
  .object({
    stream: yup.boolean().optional(),
  })
  .optional()
  .default({})

export const GetPeersResponseSchema: yup.ObjectSchema<GetPeersResponse> = yup
  .object({
    peers: yup
      .array(
        yup
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
      )
      .defined(),
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

    const peers = getPeers(peerNetwork)

    if (!request.data?.stream) {
      request.end({ peers })
      return
    }

    request.stream({ peers })

    const interval = setInterval(() => {
      const peers = getPeers(peerNetwork)
      request.stream({ peers })
    }, 1000)

    request.onClose.on(() => {
      clearInterval(interval)
    })
  },
)

function getPeers(network: PeerNetwork): PeerResponse[] {
  const result: PeerResponse[] = []

  for (const peer of network.peerManager.peers) {
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
    })
  }

  return result
}
