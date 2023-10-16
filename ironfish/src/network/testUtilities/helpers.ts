/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert } from '../../assert'
import { Identity, isIdentity } from '../identity'
import { GetBlockHeadersResponse } from '../messages/getBlockHeaders'
import { GetBlocksResponse } from '../messages/getBlocks'
import { GetBlockTransactionsResponse } from '../messages/getBlockTransactions'
import { GetCompactBlockResponse } from '../messages/getCompactBlock'
import { NetworkMessage } from '../messages/networkMessage'
import {
  Connection,
  ConnectionDirection,
  WebRtcConnection,
  WebSocketConnection,
} from '../peers/connections'
import { Peer } from '../peers/peer'
import { defaultFeatures } from '../peers/peerFeatures'
import { PeerManager } from '../peers/peerManager'
import { WebSocketClient } from '../webSocketClient'
import { mockIdentity } from './mockIdentity'

export function getConnectingPeer(
  pm: PeerManager,
  direction = ConnectionDirection.Outbound,
  identity?: string | Identity,
): { peer: Peer; connection: WebSocketConnection } {
  let peer: Peer | undefined

  if (direction === ConnectionDirection.Outbound) {
    peer = pm.connectToWebSocketAddress({
      host: 'testuri',
      port: 9033,
    })
  } else {
    peer = pm.getOrCreatePeer(identity ?? null)

    const connection = new WebSocketConnection(
      new WebSocketClient(''),
      ConnectionDirection.Inbound,
      peer.logger,
    )

    peer.setWebSocketConnection(connection)
  }

  Assert.isNotUndefined(peer)

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
  direction = ConnectionDirection.Outbound,
  identity?: string | Identity,
): { peer: Peer; connection: WebSocketConnection } {
  const { peer, connection } = getConnectingPeer(pm, direction, identity)
  connection.setState({ type: 'WAITING_FOR_IDENTITY' })

  expect(peer.state.type).toBe('CONNECTING')
  return { peer, connection: connection }
}

/* Used for constructing stubbed messages to send to the PeerManager.onMessage */
export function peerMessage<T extends NetworkMessage>(peer: Peer, message: T): [Peer, T] {
  return [peer, message]
}

/* Add new peers to the PeerManager and spy on peer.send() */
export const getConnectedPeersWithSpies = (
  peerManager: PeerManager,
  count: number,
): {
  peer: Peer
  sendSpy: jest.SpyInstance<Connection | null, [message: NetworkMessage]>
}[] => {
  return [...Array<null>(count)].map((_) => {
    const { peer } = getConnectedPeer(peerManager)
    const sendSpy = jest.spyOn(peer, 'send')

    return { peer, sendSpy }
  })
}

export function getInboundConnectedPeer(
  pm: PeerManager,
  identity?: string | Identity,
): { peer: Peer; connection: WebSocketConnection } {
  const { peer, connection } = getConnectingPeer(pm, ConnectionDirection.Inbound)

  if (!identity) {
    identity = jest.requireActual<typeof import('uuid')>('uuid').v4()
  }

  if (!isIdentity(identity)) {
    identity = mockIdentity(identity)
  }

  connection.setState({ type: 'CONNECTED', identity })

  peer.features = defaultFeatures()

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

  peer.features = defaultFeatures()

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

  // We don't expect this function to be called multiple times, so make sure
  // we're not resetting pre-existing peer candidate data.
  Assert.isFalse(pm.peerCandidates.has(peerIdentity))

  // Link the peers
  pm.peerCandidates.addFromPeerList(brokeringPeerIdentity, {
    address: peer.address,
    port: peer.port,
    identity: Buffer.from(peerIdentity, 'base64'),
  })

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

export function expectGetCompactBlockResponseToMatch(
  a: GetCompactBlockResponse,
  b: GetCompactBlockResponse,
): void {
  // Test transactions separately because Transaction is not a primitive type
  expect(a.compactBlock.transactions.length).toEqual(b.compactBlock.transactions.length)
  a.compactBlock.transactions.forEach((transactionA, transactionIndexA) => {
    const transactionB = b.compactBlock.transactions[transactionIndexA]

    expect(transactionA.index).toEqual(transactionB.index)
    expect(transactionA.transaction.hash().equals(transactionB.transaction.hash())).toBe(true)
  })

  expect({
    ...a,
    compactBlock: { ...a.compactBlock, transactions: undefined },
  }).toMatchObject({ ...b, compactBlock: { ...b.compactBlock, transactions: undefined } })
}

export function expectGetBlockTransactionsResponseToMatch(
  a: GetBlockTransactionsResponse,
  b: GetBlockTransactionsResponse,
): void {
  // Test transactions separately because Transaction is not a primitive type
  expect(a.transactions.length).toEqual(b.transactions.length)
  a.transactions.forEach((transactionA, transactionIndexA) => {
    const transactionB = b.transactions[transactionIndexA]

    expect(transactionA.hash().equals(transactionB.hash())).toBe(true)
  })

  expect({ ...a, transactions: undefined }).toMatchObject({ ...b, transactions: undefined })
}

export function expectGetBlockHeadersResponseToMatch(
  a: GetBlockHeadersResponse,
  b: GetBlockHeadersResponse,
): void {
  expect(a.headers.length).toEqual(b.headers.length)
  a.headers.forEach((headerA, headerIndexA) => {
    const headerB = b.headers[headerIndexA]

    expect(headerA.hash).toEqual(headerB.hash)
  })

  expect({ ...a, headers: undefined }).toMatchObject({ ...b, headers: undefined })
}

export function expectGetBlocksResponseToMatch(
  a: GetBlocksResponse,
  b: GetBlocksResponse,
): void {
  expect(a.blocks.length).toEqual(b.blocks.length)
  a.blocks.forEach((blockA, blockIndexA) => {
    const blockB = b.blocks[blockIndexA]

    expect(blockA.equals(blockB)).toBe(true)
  })

  expect({ ...a, blocks: undefined }).toMatchObject({ ...b, blocks: undefined })
}
