/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

jest.mock('ws')

import ws from 'ws'
import { createRootLogger } from '../../logger'
import { PeerListRequestMessage } from '../messages/peerListRequest'
import { mockIdentity } from '../testUtilities'
import { ConnectionDirection, WebRtcConnection, WebSocketConnection } from './connections'
import { BAN_SCORE, Peer } from './peer'

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

describe('Handles message send failure', () => {
  it('Disconnects peer on error in _send', () => {
    const connection = new WebRtcConnection(true, createRootLogger())
    expect(connection.state.type).toEqual('CONNECTING')

    const peer = new Peer(null)

    connection.setState({ type: 'CONNECTED', identity: mockIdentity('peer') })
    peer.setWebRtcConnection(connection)
    const sendSpy = jest.spyOn(connection, '_send').mockImplementation(() => {
      throw new Error()
    })

    expect(peer.state.type).toEqual('CONNECTED')
    const result = peer.send(new PeerListRequestMessage())
    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(result).toBeNull()
    expect(peer.state.type).toEqual('DISCONNECTED')
  })

  it('Leaves peer connected if _send returns false', () => {
    const connection = new WebSocketConnection(
      new ws(''),
      ConnectionDirection.Outbound,
      createRootLogger(),
    )
    expect(connection.state.type).toEqual('CONNECTING')

    const peer = new Peer(null)

    connection.setState({ type: 'CONNECTED', identity: mockIdentity('peer') })
    peer.setWebSocketConnection(connection)
    jest.spyOn(connection, '_send').mockReturnValue(false)

    expect(peer.state.type).toEqual('CONNECTED')
    const result = peer.send(new PeerListRequestMessage())
    expect(result).toBeNull()
    expect(peer.state.type).toEqual('CONNECTED')
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

    jest.spyOn(wrtcConnection, '_send').mockReturnValue(false)

    const wsSendSpy = jest.spyOn(wsConnection, 'send')
    const message = new PeerListRequestMessage()

    expect(peer.state.type).toEqual('CONNECTED')
    const result = peer.send(message)
    expect(result).toBe(wsConnection)
    expect(peer.state.type).toEqual('CONNECTED')
    expect(wsSendSpy).toHaveBeenCalledWith(message)
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

  peer.setWebSocketConnection(connection)

  expect(peer.state).toEqual({
    type: 'CONNECTED',
    identity: identity,
    connections: { webSocket: connection },
  })
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

describe('punish', () => {
  it('Emits onBanned when punish is called with BAN_SCORE.MAX', () => {
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

    peer.setWebSocketConnection(connection)

    expect(peer.state).toEqual({
      type: 'CONNECTED',
      identity: identity,
      connections: { webSocket: connection },
    })

    const onBannedHandler = jest.fn<(reason: string) => void>()
    peer.onBanned.on(onBannedHandler)
    peer.punish(BAN_SCORE.MAX, 'TESTING')

    expect(onBannedHandler).toHaveBeenCalled()
  })
})
