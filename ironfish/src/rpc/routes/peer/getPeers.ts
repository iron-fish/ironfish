/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { PeerNetwork } from '../../../network'
import { FullNode } from '../../../node'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { ConnectionState, RpcPeerResponse, RpcPeerResponseSchema } from './types'

export type GetPeersRequest =
  | undefined
  | {
      stream?: boolean
    }

export type GetPeersResponse = {
  peers: RpcPeerResponse[]
}

export const GetPeersRequestSchema: yup.ObjectSchema<GetPeersRequest> = yup
  .object({
    stream: yup.boolean().optional(),
  })
  .optional()
  .default({})

export const GetPeersResponseSchema: yup.ObjectSchema<GetPeersResponse> = yup
  .object({
    peers: yup.array(RpcPeerResponseSchema).defined(),
  })
  .defined()

routes.register<typeof GetPeersRequestSchema, GetPeersResponse>(
  `${ApiNamespace.peer}/getPeers`,
  GetPeersRequestSchema,
  (request, node): void => {
    Assert.isInstanceOf(node, FullNode)

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

function getPeers(network: PeerNetwork): RpcPeerResponse[] {
  const result: RpcPeerResponse[] = []

  for (const peer of network.peerManager.peers) {
    let connections = 0
    let connectionWebRTC: ConnectionState = ''
    let connectionWebSocket: ConnectionState = ''
    let connectionWebRTCError = ''
    let connectionWebSocketError = ''
    let connectionDirection = ''

    if (peer.state.type !== 'DISCONNECTED') {
      if (peer.state.connections.webSocket) {
        connectionWebSocket = peer.state.connections.webSocket.state.type
        connectionWebSocketError = String(peer.state.connections.webSocket.error || '')
        connectionDirection = peer.state.connections.webSocket.direction
      }

      if (peer.state.connections.webRtc) {
        connectionWebRTC = peer.state.connections.webRtc.state.type
        connectionWebRTCError = String(peer.state.connections.webRtc.error || '')
        connectionDirection = peer.state.connections.webRtc.direction
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
      networkId: peer.networkId,
      genesisBlockHash: peer.genesisBlockHash?.toString('hex') || null,
      features: peer.features,
      connectionWebSocket,
      connectionWebSocketError,
      connectionWebRTC,
      connectionWebRTCError,
      connectionDirection,
    })
  }

  return result
}
