/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as encryption from './encryption'

jest.mock('ws')
jest.mock('./encryption', () => {
  const originalModule = jest.requireActual<typeof encryption>('./encryption')

  return {
    ...originalModule,
    boxMessage: jest
      .fn()
      .mockReturnValue({ nonce: 'boxMessageNonce', boxedMessage: 'boxMessageMessage' }),
    unboxMessage: jest.fn().mockReturnValue(JSON.stringify({ type: 'offer' })),
  }
})

import ws from 'ws'
import { createRootLogger } from '../../logger'
import { mockIdentity } from '../testUtilities'
import {
  ConnectionDirection,
  ConnectionType,
  WebRtcConnection,
  WebSocketConnection,
} from './connections'
import { Peer } from './peer'

jest.useFakeTimers()

describe('Starts in the DISCONNECTED state', () => {
  it('Initializes identity for null identity', () => {
    const unidentifiedPeer = new Peer(null)
    expect(unidentifiedPeer.state).toEqual({
      type: 'DISCONNECTED',
      identity: null,
    })
  })

  it('Initializes identity when given an identity', () => {
    const identity = mockIdentity('peer')
    const peer = new Peer(identity)
    expect(peer.state).toEqual({
      type: 'DISCONNECTED',
      identity: identity,
    })
  })
})

describe('setWebSocketConnection', () => {
  it('Changes to CONNECTING when in DISCONNECTED', () => {
    const identity = mockIdentity('peer')
    const peer = new Peer(identity)
    const connection = new WebSocketConnection(
      new ws(''),
      ConnectionDirection.Outbound,
      createRootLogger(),
    )
    peer.setWebSocketConnection(connection)
    expect(peer.state).toEqual({
      type: 'CONNECTING',
      identity: identity,
      connections: { webSocket: connection },
    })
  })

  it('Call successfulConnection when CONNECTED', () => {
    const identity = mockIdentity('peer')
    const peer = new Peer(identity)
    const connection = new WebSocketConnection(
      new ws(''),
      ConnectionDirection.Outbound,
      createRootLogger(),
    )
    const retry = peer.getConnectionRetry(
      ConnectionType.WebSocket,
      ConnectionDirection.Outbound,
    )
    if (retry === null) {
      throw new Error('Retry should not be null')
    }
    const successSpy = jest.spyOn(retry, 'successfulConnection')

    connection.setState({ type: 'CONNECTED', identity: identity })
    peer.setWebSocketConnection(connection)

    expect(peer.state).toEqual({
      type: 'CONNECTED',
      identity: identity,
      connections: { webSocket: connection },
    })
    expect(successSpy).toBeCalled()
  })
})

describe('setWebRtcConnection', () => {
  it('Changes to CONNECTING when in DISCONNECTED', () => {
    const identity = mockIdentity('peer')
    const peer = new Peer(identity)
    const connection = new WebRtcConnection(false, createRootLogger())

    peer.setWebRtcConnection(connection)
    expect(peer.state).toEqual({
      type: 'CONNECTING',
      identity: identity,
      connections: { webRtc: connection },
    })
  })

  it('Updates supportedConnectionTypes when CONNECTED', () => {
    const identity = mockIdentity('peer')
    const peer = new Peer(identity)
    const connection = new WebRtcConnection(true, createRootLogger())

    const retry = peer.getConnectionRetry(ConnectionType.WebRtc, ConnectionDirection.Outbound)
    if (retry === null) {
      throw new Error('Retry should not be null')
    }
    const successSpy = jest.spyOn(retry, 'successfulConnection')

    connection.setState({ type: 'CONNECTED', identity: identity })
    peer.setWebRtcConnection(connection)

    expect(peer.state).toEqual({
      type: 'CONNECTED',
      identity: identity,
      connections: { webRtc: connection },
    })
    expect(successSpy).toBeCalled()
  })
})

it('Times out WebRTC handshake', () => {
  const connection = new WebRtcConnection(false, createRootLogger())
  expect(connection.state.type).toEqual('CONNECTING')

  const peer = new Peer(null)

  // Time out requesting signaling
  connection.setState({ type: 'REQUEST_SIGNALING' })
  expect(connection.state.type).toEqual('REQUEST_SIGNALING')
  peer.setWebRtcConnection(connection)
  expect(peer.state.type).toEqual('CONNECTING')
  jest.runOnlyPendingTimers()
  expect(connection.state.type).toEqual('DISCONNECTED')
  expect(peer.state.type).toEqual('DISCONNECTED')

  // Time out signaling
  connection.setState({ type: 'SIGNALING' })
  expect(connection.state.type).toEqual('SIGNALING')
  peer.setWebRtcConnection(connection)
  expect(peer.state.type).toEqual('CONNECTING')
  jest.runOnlyPendingTimers()
  expect(connection.state.type).toEqual('DISCONNECTED')
  expect(peer.state.type).toEqual('DISCONNECTED')

  // Time out waiting for identity
  connection.setState({ type: 'WAITING_FOR_IDENTITY' })
  expect(connection.state.type).toEqual('WAITING_FOR_IDENTITY')
  peer.setWebRtcConnection(connection)
  expect(peer.state.type).toEqual('CONNECTING')
  jest.runOnlyPendingTimers()
  expect(connection.state.type).toEqual('DISCONNECTED')
  expect(peer.state.type).toEqual('DISCONNECTED')

  // Cancel timeout if we identify
  connection.setState({ type: 'WAITING_FOR_IDENTITY' })
  expect(connection.state.type).toEqual('WAITING_FOR_IDENTITY')
  peer.setWebRtcConnection(connection)
  expect(peer.state.type).toEqual('CONNECTING')
  connection.setState({ type: 'CONNECTED', identity: mockIdentity('peer') })
  jest.runOnlyPendingTimers()
  expect(connection.state.type).toEqual('CONNECTED')
  expect(peer.state.type).toEqual('CONNECTED')
})

describe('Handles WebRTC message send failure', () => {
  it('Handles failure if WebRTC is only connection', () => {
    const connection = new WebRtcConnection(true, createRootLogger())
    expect(connection.state.type).toEqual('CONNECTING')

    const peer = new Peer(null)

    // Time out requesting signaling
    connection.setState({ type: 'CONNECTED', identity: mockIdentity('peer') })
    peer.setWebRtcConnection(connection)
    if (!connection['datachannel']) {
      throw new Error('Should have datachannel')
    }
    jest.spyOn(connection['datachannel'], 'sendMessage').mockImplementation(() => {
      throw new Error('Error')
    })
    jest.spyOn(connection['datachannel'], 'isOpen').mockImplementation(() => true)

    expect(peer.state.type).toEqual('CONNECTED')
    const result = peer.send({ type: 'test', payload: {} })
    expect(result).toBeNull()
    expect(peer.state.type).toEqual('DISCONNECTED')
  })

  it('Falls back to WebSockets if available and WebRTC send fails', () => {
    const wrtcConnection = new WebRtcConnection(true, createRootLogger())
    const wsConnection = new WebSocketConnection(
      new ws(''),
      ConnectionDirection.Outbound,
      createRootLogger(),
    )

    const peer = new Peer(null)

    // Time out requesting signaling
    wsConnection.setState({ type: 'CONNECTED', identity: mockIdentity('peer') })
    wrtcConnection.setState({ type: 'CONNECTED', identity: mockIdentity('peer') })
    peer.setWebRtcConnection(wrtcConnection)
    peer.setWebSocketConnection(wsConnection)

    if (wrtcConnection['datachannel']) {
      jest.spyOn(wrtcConnection['datachannel'], 'sendMessage').mockImplementation(() => {
        throw new Error('Error')
      })
    }

    const wsSendSpy = jest.spyOn(wsConnection, 'send')
    const message = { type: 'test', payload: {} }

    expect(peer.state.type).toEqual('CONNECTED')
    const result = peer.send(message)
    expect(result).toBe(wsConnection)
    expect(peer.state.type).toEqual('CONNECTED')
    expect(wsSendSpy).toBeCalledWith(message)
  })
})

it('Transitions to DISCONNECTED when all connections disconnect', () => {
  const peer = new Peer(null)
  const connection = new WebSocketConnection(
    new ws(''),
    ConnectionDirection.Outbound,
    createRootLogger(),
  )
  peer.setWebSocketConnection(connection)
  expect(peer.state).toEqual({
    type: 'CONNECTING',
    identity: null,
    connections: { webSocket: connection },
  })

  connection.setState({ type: 'DISCONNECTED' })

  expect(peer.state).toEqual({
    type: 'DISCONNECTED',
    identity: null,
  })
})

it('Transitions to CONNECTED when a connection receives an identity', () => {
  const identity = mockIdentity('peer')
  const peer = new Peer(null)
  const connection = new WebSocketConnection(
    new ws(''),
    ConnectionDirection.Outbound,
    createRootLogger(),
  )
  peer.setWebSocketConnection(connection)
  const retry = peer.getConnectionRetry(ConnectionType.WebSocket, ConnectionDirection.Outbound)
  if (retry === null) {
    throw new Error('Retry should not be null')
  }
  const successSpy = jest.spyOn(retry, 'successfulConnection')

  expect(peer.state).toEqual({
    type: 'CONNECTING',
    identity: null,
    connections: { webSocket: connection },
  })

  connection.setState({ type: 'CONNECTED', identity })

  expect(peer.state).toEqual({
    type: 'CONNECTED',
    identity: identity,
    connections: { webSocket: connection },
  })
  expect(successSpy).toBeCalled()
})

it('Transitions to CONNECTED when adding a connection with state CONNECTED', () => {
  const identity = mockIdentity('peer')
  const peer = new Peer(null)
  const connection = new WebSocketConnection(
    new ws(''),
    ConnectionDirection.Outbound,
    createRootLogger(),
  )
  connection.setState({
    type: 'CONNECTED',
    identity,
  })
  const retry = peer.getConnectionRetry(ConnectionType.WebSocket, ConnectionDirection.Outbound)
  if (retry === null) {
    throw new Error('Retry should not be null')
  }
  const successSpy = jest.spyOn(retry, 'successfulConnection')

  peer.setWebSocketConnection(connection)

  expect(peer.state).toEqual({
    type: 'CONNECTED',
    identity: identity,
    connections: { webSocket: connection },
  })
  expect(successSpy).toBeCalled()
})

it('Stays in CONNECTED when adding an additional connection', () => {
  const identity = mockIdentity('peer')
  const peer = new Peer(null)
  const connection = new WebSocketConnection(
    new ws(''),
    ConnectionDirection.Outbound,
    createRootLogger(),
  )
  peer.setWebSocketConnection(connection)
  expect(peer.state).toEqual({
    type: 'CONNECTING',
    identity: null,
    connections: { webSocket: connection },
  })

  connection.setState({ type: 'CONNECTED', identity })

  // Add in an additional connection
  const wrtcConnection = new WebRtcConnection(true, createRootLogger())
  peer.setWebRtcConnection(wrtcConnection)
  expect(wrtcConnection.state.type).not.toBe('CONNECTED')

  expect(peer.state).toEqual({
    type: 'CONNECTED',
    identity: identity,
    connections: { webSocket: connection, webRtc: wrtcConnection },
  })
})

describe('Stays in CONNECTED when one connection disconnects', () => {
  it('WebSocket disconnects', () => {
    const identity = mockIdentity('peer')
    const peer = new Peer(null)

    // Add a CONNECTED WebSocket connection
    const connection = new WebSocketConnection(
      new ws(''),
      ConnectionDirection.Outbound,
      createRootLogger(),
    )
    peer.setWebSocketConnection(connection)
    connection.setState({ type: 'CONNECTED', identity })

    // Add a CONNECTED WebRTC connection
    const wrtcConnection = new WebRtcConnection(true, createRootLogger())
    peer.setWebRtcConnection(wrtcConnection)
    wrtcConnection.setState({ type: 'CONNECTED', identity })

    expect(peer.state.type).toBe('CONNECTED')

    connection.close()

    expect(peer.state).toEqual({
      type: 'CONNECTED',
      identity: identity,
      connections: { webRtc: wrtcConnection },
    })
  })

  it('WebRTC disconnects', () => {
    const identity = mockIdentity('peer')
    const peer = new Peer(null)

    // Add a CONNECTED WebSocket connection
    const connection = new WebSocketConnection(
      new ws(''),
      ConnectionDirection.Outbound,
      createRootLogger(),
    )
    peer.setWebSocketConnection(connection)
    connection.setState({ type: 'CONNECTED', identity })

    // Add a CONNECTED WebRTC connection
    const wrtcConnection = new WebRtcConnection(true, createRootLogger())
    peer.setWebRtcConnection(wrtcConnection)
    wrtcConnection.setState({ type: 'CONNECTED', identity })

    expect(peer.state.type).toBe('CONNECTED')

    wrtcConnection.close()

    expect(peer.state).toEqual({
      type: 'CONNECTED',
      identity: identity,
      connections: { webSocket: connection },
    })
  })
})

describe('Updates supportedConnectionTypes when one connection disconnects with an error', () => {
  it('WebSocket disconnects', () => {
    const peer = new Peer(null)

    const retry = peer.getConnectionRetry(
      ConnectionType.WebSocket,
      ConnectionDirection.Outbound,
    )
    if (retry === null) {
      throw new Error('Retry should not be null')
    }
    const failSpy = jest.spyOn(retry, 'failedConnection')

    const connection = new WebSocketConnection(
      new ws(''),
      ConnectionDirection.Outbound,
      createRootLogger(),
    )
    peer.setWebSocketConnection(connection)

    connection['_error'] = new Error('Test')
    connection.setState({ type: 'DISCONNECTED' })
    expect(failSpy).toBeCalled()
  })

  it('WebRTC disconnects', () => {
    const peer = new Peer(null)

    const retry = peer.getConnectionRetry(ConnectionType.WebRtc, ConnectionDirection.Outbound)
    if (retry === null) {
      throw new Error('Retry should not be null')
    }
    const failSpy = jest.spyOn(retry, 'failedConnection')

    const connection = new WebRtcConnection(true, createRootLogger())
    peer.setWebRtcConnection(connection)

    connection['_error'] = new Error('Test')
    connection.setState({ type: 'DISCONNECTED' })

    expect(failSpy).toBeCalled()
  })
})

it('Does not clear knownPeers when transitioning to DISCONNECTED', () => {
  // knownPeers represents other peers' connections to a given peer. Just because
  // we disconnected from the peer doesn't mean that other peers also did so

  const peer1Identity = mockIdentity('peer1')
  const peer2Identity = mockIdentity('peer2')
  const peer1 = new Peer(null)
  const peer2 = new Peer(peer2Identity)
  const connection = new WebSocketConnection(
    new ws(''),
    ConnectionDirection.Outbound,
    createRootLogger(),
  )
  peer1.setWebSocketConnection(connection)
  expect(peer1.state).toEqual({
    type: 'CONNECTING',
    identity: null,
    connections: { webSocket: connection },
  })
  connection.setState({
    type: 'CONNECTED',
    identity: peer1Identity,
  })
  peer1.knownPeers.set(peer2Identity, peer2)
  peer2.knownPeers.set(peer1Identity, peer1)
  const onKnownPeersChangedSpy = jest.spyOn(peer1.onKnownPeersChanged, 'emit')

  connection.close()

  expect(onKnownPeersChangedSpy).not.toBeCalled()
  expect(peer1.knownPeers.size).toBe(1)
  expect(peer1.knownPeers.has(peer2Identity)).toBeTruthy()
  expect(peer2.knownPeers.size).toBe(1)
  expect(peer2.knownPeers.has(peer1Identity)).toBeTruthy()
})
