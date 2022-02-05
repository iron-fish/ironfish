/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import ws from 'ws'
import { Identity, isIdentity } from '../identity'
import {
  Connection,
  ConnectionDirection,
  ConnectionType,
  WebRtcConnection,
  WebSocketConnection,
} from '../peers/connections'
import { Peer } from '../peers/peer'
import { PeerManager } from '../peers/peerManager'
import { mockIdentity } from './mockIdentity'

export function getConnectingPeer(
  pm: PeerManager,
  disposable = true,
  direction = ConnectionDirection.Outbound,
): { peer: Peer; connection: WebSocketConnection } {
  let peer: Peer | null = null

  if (direction === ConnectionDirection.Outbound) {
    peer = pm.connectToWebSocketAddress('ws://testuri.com:9033')
  } else {
    peer = pm.getOrCreatePeer(null)

    const connection = new WebSocketConnection(
      new ws(''),
      ConnectionDirection.Inbound,
      peer.logger,
    )

    peer.setWebSocketConnection(connection)
  }

  if (disposable) {
    peer
      .getConnectionRetry(ConnectionType.WebSocket, ConnectionDirection.Outbound)
      ?.neverRetryConnecting()
  }

  expect(peer.state).toEqual({
    type: 'CONNECTING',
    identity: peer.state.identity,
    connections: {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      webSocket: expect.any(WebSocketConnection),
    },
  })

  if (peer.state.type !== 'CONNECTING') {
    throw new Error('state should be CONNECTING')
  }
  if (peer.state.connections.webSocket === undefined) {
    throw new Error('WebSocket connection should be defined')
  }

  jest.spyOn(peer.state.connections.webSocket, 'send').mockImplementation(() => true)

  return { peer, connection: peer.state.connections.webSocket }
}

export function getWaitingForIdentityPeer(
  pm: PeerManager,
  disposable = true,
  direction = ConnectionDirection.Outbound,
): { peer: Peer; connection: WebSocketConnection } {
  const { peer, connection } = getConnectingPeer(pm, disposable, direction)
  connection.setState({ type: 'WAITING_FOR_IDENTITY' })

  expect(peer.state.type).toBe('CONNECTING')
  return { peer, connection: connection }
}

export function getConnectedPeer(
  pm: PeerManager,
  identity?: string | Identity,
): { peer: Peer; connection: WebSocketConnection } {
  const { peer, connection } = getConnectingPeer(pm)

  if (!identity) {
    identity = jest.requireActual<typeof import('uuid')>('uuid').v4()
  }

  if (!isIdentity(identity)) {
    identity = mockIdentity(identity)
  }

  connection.setState({ type: 'CONNECTED', identity })

  return { peer, connection: connection }
}

export function getDisconnectedPeer(pm: PeerManager, identity?: string | Identity): Peer {
  if (!identity) {
    identity = jest.requireActual<typeof import('uuid')>('uuid').v4()
  }

  if (!isIdentity(identity)) {
    identity = mockIdentity(identity)
  }

  const peer = pm.getOrCreatePeer(identity)
  return peer
}

export function getSignalingWebRtcPeer(
  pm: PeerManager,
  brokeringPeerIdentity: Identity,
  peerIdentity: Identity,
): {
  peer: Peer
  connection: WebRtcConnection
  brokeringPeer: Peer
  brokeringConnection: Connection
} {
  // Create the peers
  const { peer: brokeringPeer, connection: brokeringConnection } = getConnectedPeer(
    pm,
    brokeringPeerIdentity,
  )
  const peer = pm.getOrCreatePeer(peerIdentity)

  // Link the peers
  brokeringPeer.knownPeers.set(peerIdentity, peer)
  peer.knownPeers.set(brokeringPeerIdentity, brokeringPeer)

  // Verify peer2 is not connected
  expect(peer.address).toBeNull()
  expect(peer.state).toEqual({
    type: 'DISCONNECTED',
    identity: peerIdentity,
  })

  pm.connectToWebRTC(peer)

  expect(peer.state).toEqual({
    type: 'CONNECTING',
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    connections: { webRtc: expect.any(WebRtcConnection) },
    identity: peer.state.identity,
  })

  if (peer.state.type !== 'CONNECTING') {
    throw new Error('Peer state should be CONNECTING')
  }
  const connection = peer.state.connections.webRtc

  // Send a signal to trigger the connection into a SIGNALING state
  connection?.signal({
    type: 'candidate',
    candidate: {
      candidate: '',
      sdpMLineIndex: 0,
      sdpMid: '0',
    },
  })
  expect(connection?.state.type).toBe('SIGNALING')
  if (connection?.state.type !== 'SIGNALING') {
    throw new Error('Connection')
  }

  return { peer, connection: connection, brokeringPeer, brokeringConnection }
}
