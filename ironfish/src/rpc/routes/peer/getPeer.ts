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

export type GetPeerRequest = {
  identity: string
  stream?: boolean
}

export type GetPeerResponse = {
  peer: RpcPeerResponse | null
}

export const GetPeerRequestSchema: yup.ObjectSchema<GetPeerRequest> = yup
  .object({
    identity: yup.string().defined(),
    stream: yup.boolean().optional(),
  })
  .defined()

export const GetPeerResponseSchema: yup.ObjectSchema<GetPeerResponse> = yup
  .object({
    peer: RpcPeerResponseSchema.nullable().defined(),
  })
  .defined()

routes.register<typeof GetPeerRequestSchema, GetPeerResponse>(
  `${ApiNamespace.peer}/getPeer`,
  GetPeerRequestSchema,
  (request, node): void => {
    Assert.isInstanceOf(node, FullNode)

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

function getPeer(network: PeerNetwork, identity: string): RpcPeerResponse | null {
  for (const peer of network.peerManager.peers) {
    if (peer.state.identity !== null && peer.state.identity.includes(identity)) {
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
        networkId: peer.networkId,
        genesisBlockHash: peer.genesisBlockHash?.toString('hex') || null,
        features: peer.features,
        connectionWebSocket,
        connectionWebSocketError,
        connectionWebRTC,
        connectionWebRTCError,
        connectionDirection,
      }
    }
  }

  return null
}
