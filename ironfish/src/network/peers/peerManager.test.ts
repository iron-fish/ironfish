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
    unboxMessage: jest.fn().mockReturnValue(
      JSON.stringify({
        type: 'candidate',
        candidate: {
          candidate: '',
          sdpMLineIndex: 0,
          sdpMid: '0',
        },
      }),
    ),
  }
})

import { mocked } from 'ts-jest/utils'
import ws from 'ws'
import { Assert } from '../../assert'
import { canInitiateWebRTC, privateIdentityToIdentity } from '../identity'
import {
  DisconnectingMessage,
  DisconnectingReason,
  Identify,
  InternalMessageType,
  PeerList,
  PeerListRequest,
  Signal,
  SignalRequest,
} from '../messages'
import {
  getConnectedPeer,
  getConnectingPeer,
  getSignalingWebRtcPeer,
  getWaitingForIdentityPeer,
  mockHostsStore,
  mockIdentity,
  mockLocalPeer,
  mockPrivateIdentity,
  webRtcCanInitiateIdentity,
  webRtcCannotInitiateIdentity,
  webRtcLocalIdentity,
} from '../testUtilities'
import { VERSION_PROTOCOL, VERSION_PROTOCOL_MIN } from '../version'
import {
  ConnectionDirection,
  ConnectionType,
  WebRtcConnection,
  WebSocketConnection,
} from './connections'
import { PeerManager } from './peerManager'

jest.useFakeTimers()

describe('PeerManager', () => {
  describe('Dispose peers', () => {
    it('Should not dispose of peers that have a CONNECTED peer', () => {
      const pm = new PeerManager(mockLocalPeer(), mockHostsStore())
      const peer1Identity = mockIdentity('peer1')
      const peer2Identity = mockIdentity('peer2')
      const { peer: peer1 } = getConnectedPeer(pm, peer1Identity)

      const peer2 = pm.getOrCreatePeer(peer2Identity)
      peer2.setWebSocketAddress(null, null)
      peer1.knownPeers.set(peer2Identity, peer2)

      expect(pm.identifiedPeers.size).toBe(2)
      expect(pm.peers.length).toBe(2)

      pm['disposePeers']()

      expect(pm.identifiedPeers.size).toBe(2)
      expect(pm.peers.length).toBe(2)
    })

    it('Should dispose of two DISCONNECTED peers that have each other in knownPeers', () => {
      const pm = new PeerManager(mockLocalPeer(), mockHostsStore())
      const peer1Identity = mockIdentity('peer1')
      const peer2Identity = mockIdentity('peer2')
      const { peer: peer1 } = getConnectedPeer(pm, peer1Identity)
      const { peer: peer2 } = getConnectedPeer(pm, peer2Identity)

      peer1.knownPeers.set(peer2Identity, peer2)
      peer2.knownPeers.set(peer1Identity, peer1)

      peer1.close()
      peer2.close()
      peer1
        .getConnectionRetry(ConnectionType.WebSocket, ConnectionDirection.Outbound)
        ?.neverRetryConnecting()
      peer2
        .getConnectionRetry(ConnectionType.WebSocket, ConnectionDirection.Outbound)
        ?.neverRetryConnecting()

      expect(peer1.knownPeers.size).toBe(1)
      expect(peer2.knownPeers.size).toBe(1)
      expect(pm.identifiedPeers.size).toBe(2)
      expect(pm.peers.length).toBe(2)

      pm['disposePeers']()

      expect(pm.identifiedPeers.size).toBe(0)
      expect(pm.peers.length).toBe(0)
    })
  })

  it('should handle duplicate connections from the same peer', () => {
    const localPeer = mockLocalPeer({ identity: webRtcLocalIdentity() })
    const peers = new PeerManager(localPeer, mockHostsStore())

    const { peer: peerOut, connection: connectionOut } = getWaitingForIdentityPeer(
      peers,
      true,
      ConnectionDirection.Outbound,
    )
    const { peer: peerIn1, connection: connectionIn1 } = getWaitingForIdentityPeer(
      peers,
      true,
      ConnectionDirection.Inbound,
    )
    const { peer: peerIn2, connection: connectionIn2 } = getWaitingForIdentityPeer(
      peers,
      true,
      ConnectionDirection.Inbound,
    )

    // Create identity and message for all peers
    const identity = webRtcCannotInitiateIdentity()
    const message: Identify = {
      type: InternalMessageType.identity,
      payload: {
        identity: identity,
        version: VERSION_PROTOCOL,
        agent: '',

        head: '',
        sequence: 1,
        work: BigInt(0).toString(),
        port: null,
      },
    }

    // Identify peerOut
    peerOut.onMessage.emit(message, connectionOut)
    // Check PeerManager
    expect(peers.identifiedPeers.size).toBe(1)
    expect(peers.peers.length).toBe(3)
    // Connections
    expect(connectionOut.state.type).toEqual('CONNECTED')
    expect(connectionIn1.state.type).toEqual('WAITING_FOR_IDENTITY')
    expect(connectionIn2.state.type).toEqual('WAITING_FOR_IDENTITY')
    // Check Peers
    expect(peerOut.state).toMatchObject({
      type: 'CONNECTED',
      identity: identity,
      connections: { webSocket: connectionOut },
    })
    expect(peerIn1.state).toMatchObject({
      type: 'CONNECTING',
      identity: null,
      connections: { webSocket: connectionIn1 },
    })
    expect(peerIn2.state).toMatchObject({
      type: 'CONNECTING',
      identity: null,
      connections: { webSocket: connectionIn2 },
    })

    // Identify peerIn1 now
    peerIn1.onMessage.emit(message, connectionIn1)
    // Check PeerManager
    expect(peers.identifiedPeers.size).toBe(1)
    expect(peers.peers.length).toBe(2)
    // Connections
    expect(connectionOut.state.type).toEqual('DISCONNECTED')
    expect(connectionIn1.state.type).toEqual('CONNECTED')
    expect(connectionIn2.state.type).toEqual('WAITING_FOR_IDENTITY')
    // Check Peers
    expect(peerOut.state).toMatchObject({
      type: 'CONNECTED',
      identity: identity,
      connections: { webSocket: connectionIn1 },
    })
    expect(peerIn1.state).toMatchObject({
      type: 'DISCONNECTED',
      identity: identity,
    })
    expect(peerIn2.state).toMatchObject({
      type: 'CONNECTING',
      identity: null,
      connections: { webSocket: connectionIn2 },
    })

    // Identify peerIn2 now
    peerIn2.onMessage.emit(message, connectionIn2)
    // Check PeerManager
    expect(peers.identifiedPeers.size).toBe(1)
    // expect(peers.peers.length).toBe(1)
    // Connections
    expect(connectionOut.state.type).toEqual('DISCONNECTED')
    expect(connectionIn1.state.type).toEqual('CONNECTED')
    expect(connectionIn2.state.type).toEqual('DISCONNECTED')
    // Check Peers
    expect(peerOut.state).toMatchObject({
      type: 'CONNECTED',
      identity: identity,
      connections: { webSocket: connectionIn1 },
    })
    expect(peerIn1.state).toMatchObject({
      type: 'DISCONNECTED',
      identity: identity,
    })
    expect(peerIn2.state).toMatchObject({
      type: 'DISCONNECTED',
      identity: null,
    })

    // The reason peerIn1 has an identity is because it's identity is taken before
    // updatePeerMap() merges into the existing peerOut. peerIn2 has no identity
    // because new connections from the same peer have the new connection rejected.
    // peerIn2's was never set to connected, so it was never merged into peerOut.
  })

  it('Sends identity when a connection is successfully made', () => {
    const localIdentity = mockPrivateIdentity('local')
    const pm = new PeerManager(mockLocalPeer({ identity: localIdentity }), mockHostsStore())

    const { peer, connection } = getConnectingPeer(pm)

    const sendSpy = jest.spyOn(connection, 'send')

    connection.setState({ type: 'WAITING_FOR_IDENTITY' })

    expect(peer.state).toEqual({
      type: 'CONNECTING',
      identity: null,
      connections: { webSocket: connection },
    })

    Assert.isNotNull(pm.localPeer.chain.head)

    expect(sendSpy).toBeCalledWith({
      type: InternalMessageType.identity,
      payload: {
        identity: privateIdentityToIdentity(localIdentity),
        version: VERSION_PROTOCOL,
        port: null,
        agent: pm.localPeer.agent,
        head: pm.localPeer.chain.head.hash,
        sequence: Number(pm.localPeer.chain.head.sequence),
        work: pm.localPeer.chain.head.work.toString(),
      },
    })
  })

  it('should disconnect connection on CONNECTED', () => {
    const localPeer = mockLocalPeer()
    const peers = new PeerManager(localPeer, mockHostsStore())

    const { peer: peer1, connection: connection1 } = getConnectingPeer(peers)
    const { peer: peer2, connection: connection2 } = getWaitingForIdentityPeer(peers)
    const { peer: peer3, connection: connection3 } = getConnectedPeer(peers)

    const sendSpyPeer1 = jest.spyOn(connection1, 'send')
    const sendSpyPeer2 = jest.spyOn(connection2, 'send')
    const sendSpyPeer3 = jest.spyOn(connection3, 'send')

    peers.disconnect(peer1, DisconnectingReason.ShuttingDown, 0)
    peers.disconnect(peer2, DisconnectingReason.ShuttingDown, 0)
    peers.disconnect(peer3, DisconnectingReason.ShuttingDown, 0)

    expect(sendSpyPeer1).not.toHaveBeenCalled()
    expect(sendSpyPeer2).toHaveBeenCalledWith(
      expect.objectContaining({
        type: InternalMessageType.disconnecting,
      }),
    )
    expect(sendSpyPeer3).toHaveBeenCalledWith(
      expect.objectContaining({
        type: InternalMessageType.disconnecting,
      }),
    )

    expect(peer1.state.type).toEqual('DISCONNECTED')
    expect(peer2.state.type).toEqual('DISCONNECTED')
    expect(peer3.state.type).toEqual('DISCONNECTED')
  })

  describe('connect', () => {
    it('Creates a peer and adds it to unidentifiedConnections', () => {
      const pm = new PeerManager(mockLocalPeer(), mockHostsStore())
      expect(pm.peers.length).toBe(0)

      const peer = pm.connectToWebSocketAddress('testUri')

      expect(pm.identifiedPeers.size).toBe(0)
      expect(pm.peers.length).toBe(1)
      expect(peer.state).toEqual({
        type: 'CONNECTING',
        connections: { webSocket: expect.any(WebSocketConnection) },
        identity: null,
      })
      if (peer.state.type !== 'CONNECTING') {
        throw new Error('Peer state must be CONNECTING')
      }
      if (!peer.state.connections.webSocket) {
        throw new Error('Peer must have a websocket connection')
      }
      expect(peer.state.connections.webSocket.type).toEqual(ConnectionType.WebSocket)
      expect(peer.state.connections.webSocket.direction).toEqual(ConnectionDirection.Outbound)
    })

    it('Encrypts signaling data', async () => {
      const brokeringIdentity = mockIdentity('brokering')

      const pm = new PeerManager(
        mockLocalPeer({ identity: webRtcLocalIdentity() }),
        mockHostsStore(),
      )
      const { connection, brokeringPeer } = getSignalingWebRtcPeer(
        pm,
        brokeringIdentity,
        webRtcCanInitiateIdentity(),
      )
      const sendSpy = jest.spyOn(brokeringPeer, 'send')

      await connection.onSignal.emitAsync({
        type: 'candidate',
        candidate: {
          candidate: '',
          sdpMLineIndex: 0,
          sdpMid: '0',
        },
      })

      expect(sendSpy).toBeCalledTimes(1)
      expect(sendSpy).toBeCalledWith({
        type: InternalMessageType.signal,
        payload: {
          sourceIdentity: privateIdentityToIdentity(webRtcLocalIdentity()),
          destinationIdentity: webRtcCanInitiateIdentity(),
          nonce: 'boxMessageNonce',
          signal: 'boxMessageMessage',
        },
      })
    })

    it('Attempts to establish a WebSocket connection to a peer with a webSocketAddress', () => {
      const peer1Identity = mockIdentity('peer1')
      const peer2Identity = mockIdentity('peer2')
      const pm = new PeerManager(mockLocalPeer(), mockHostsStore())

      // Create the peers
      const { peer: peer1 } = getConnectedPeer(pm, peer1Identity)
      const peer2 = pm.getOrCreatePeer(peer2Identity)

      // Link the peers
      peer1.knownPeers.set(peer2Identity, peer2)
      peer2.knownPeers.set(peer1Identity, peer1)

      // Verify peer2 is not connected
      peer2.setWebSocketAddress('testuri', 9033)
      expect(peer2.state).toEqual({
        type: 'DISCONNECTED',
        identity: peer2Identity,
      })

      pm.connectToWebSocket(peer2)

      expect(peer2.state).toEqual({
        type: 'CONNECTING',
        connections: { webSocket: expect.any(WebSocketConnection) },
        identity: peer2Identity,
      })
    })

    it('Attempts to establish a WebRTC connection through brokering peer', () => {
      const peers = new PeerManager(
        mockLocalPeer({ identity: webRtcLocalIdentity() }),
        mockHostsStore(),
      )

      // Create the peers
      const { peer: brokeringPeer } = getConnectedPeer(peers)
      const targetPeer = peers.getOrCreatePeer(webRtcCanInitiateIdentity())
      expect(targetPeer.state.type).toEqual('DISCONNECTED')

      // Link the peers
      brokeringPeer.knownPeers.set(targetPeer.getIdentityOrThrow(), targetPeer)
      targetPeer.knownPeers.set(brokeringPeer.getIdentityOrThrow(), brokeringPeer)

      peers.connectToWebRTC(targetPeer)

      expect(targetPeer.state).toMatchObject({
        type: 'CONNECTING',
        connections: { webRtc: expect.any(WebRtcConnection) },
      })
    })

    it('Can establish a WebRTC connection to a peer using an existing WebSocket connection to the same peer', async () => {
      const pm = new PeerManager(
        mockLocalPeer({ identity: webRtcLocalIdentity() }),
        mockHostsStore(),
      )

      const { peer, connection } = getConnectedPeer(pm, webRtcCanInitiateIdentity())

      expect(canInitiateWebRTC(pm.localPeer.publicIdentity, peer.getIdentityOrThrow())).toBe(
        true,
      )

      // Call connect() on the same peer to initiate a WebRTC connection
      pm.connectToWebRTC(peer)

      expect(peer.state).toEqual({
        type: 'CONNECTED',
        connections: { webSocket: connection, webRtc: expect.any(WebRtcConnection) },
        identity: peer.getIdentityOrThrow(),
      })

      if (peer.state.type !== 'CONNECTED') {
        throw new Error('Peer should be in state CONNECTED')
      }
      if (!peer.state.connections.webRtc) {
        throw new Error('Peer should have a WebRTC connection')
      }

      // Emitting new signal data should trigger a send on the WS connection
      expect(pm.identifiedPeers.size).toBe(1)
      expect(pm.peers).toHaveLength(1)

      const sendSpy = mocked(connection.send)

      await peer.state.connections.webRtc.onSignal.emitAsync({
        type: 'candidate',
        candidate: {
          candidate: '',
          sdpMLineIndex: 0,
          sdpMid: '0',
        },
      })

      expect(sendSpy).toBeCalledWith({
        type: 'signal',
        payload: {
          sourceIdentity: 'bGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGw=',
          destinationIdentity: 'a2tra2tra2tra2tra2tra2tra2tra2tra2tra2tra2s=',
          nonce: 'boxMessageNonce',
          signal: 'boxMessageMessage',
        },
      })
    })

    it('Attempts to request WebRTC signaling through brokering peer', () => {
      const peers = new PeerManager(
        mockLocalPeer({ identity: webRtcLocalIdentity() }),
        mockHostsStore(),
      )

      // Create the peer to broker the connection through
      const { peer: brokeringPeer } = getConnectedPeer(peers)
      const brokerPeerSendMock = jest.fn()
      brokeringPeer.send = brokerPeerSendMock

      // Create the peer to connect to WebRTC through
      const targetPeer = peers.getOrCreatePeer(webRtcCannotInitiateIdentity())
      expect(targetPeer.state.type).toEqual('DISCONNECTED')

      // Link the peers
      brokeringPeer.knownPeers.set(targetPeer.getIdentityOrThrow(), targetPeer)
      targetPeer.knownPeers.set(brokeringPeer.getIdentityOrThrow(), brokeringPeer)

      peers.connectToWebRTC(targetPeer)
      expect(targetPeer.state).toMatchObject({
        type: 'CONNECTING',
        connections: {
          webRtc: {
            state: {
              type: 'REQUEST_SIGNALING',
            },
          },
        },
      })
      expect(brokerPeerSendMock).toBeCalledWith({
        type: InternalMessageType.signalRequest,
        payload: {
          sourceIdentity: peers.localPeer.publicIdentity,
          destinationIdentity: targetPeer.getIdentityOrThrow(),
        },
      })
    })

    it('Does not create a connection if Peer has disconnectUntil set', () => {
      const pm = new PeerManager(mockLocalPeer(), mockHostsStore())
      const { peer } = getConnectedPeer(pm, 'peer')
      peer.close()

      // Mock the logger
      pm['logger'].mockTypes(() => jest.fn())

      // Verify that we could otherwise create a connection
      pm.connectToWebSocket(peer)
      expect(peer.state.type).toBe('CONNECTING')
      peer.close()

      // Set disconnectUntil and verify that we can't create a connection
      peer.peerRequestedDisconnectUntil = Number.MAX_SAFE_INTEGER
      pm.connectToWebSocket(peer)
      expect(peer.state.type).toBe('DISCONNECTED')
    })

    it('Sets disconnectUntil to null if current time is after disconnectUntil', () => {
      const pm = new PeerManager(mockLocalPeer(), mockHostsStore())
      const { peer } = getConnectedPeer(pm, 'peer')
      peer.close()

      // Try websockets first
      peer.peerRequestedDisconnectUntil = 1
      pm.connectToWebSocket(peer)
      expect(peer.state.type).toBe('CONNECTING')
      expect(peer.peerRequestedDisconnectUntil).toBeNull()

      // Try websockets first
      peer.peerRequestedDisconnectUntil = 1
      pm.connectToWebRTC(peer)
      expect(peer.state.type).toBe('CONNECTING')
      expect(peer.peerRequestedDisconnectUntil).toBeNull()
    })

    it('Does not create a connection to a disconnected Peer above targetPeers', () => {
      const pm = new PeerManager(mockLocalPeer(), mockHostsStore(), undefined, undefined, 50, 1)

      // Add one connected peer
      getConnectedPeer(pm, 'peer1')

      // Add a second peer that's disconnected
      const peer2Identity = mockIdentity('peer2')
      const peer2 = pm.getOrCreatePeer(peer2Identity)
      peer2.setWebSocketAddress('testuri.com', 9033)

      // Mock the logger
      pm['logger'].mockTypes(() => jest.fn())

      const result = pm.connectToWebSocket(peer2)

      expect(result).toBe(false)
      expect(peer2.state).toEqual({
        type: 'DISCONNECTED',
        identity: peer2Identity,
      })
    })
  })

  describe('create peers', () => {
    it('Returns the same peer when calling createPeer twice with the same identity', () => {
      const peerIdentity = mockIdentity('peer')
      const pm = new PeerManager(mockLocalPeer(), mockHostsStore())

      const peer1 = pm.getOrCreatePeer(peerIdentity)
      const peer1Again = pm.getOrCreatePeer(peerIdentity)
      expect(peer1).toBe(peer1Again)
      expect(pm.peers.length).toBe(1)
      expect(pm.identifiedPeers.size).toBe(1)
      expect(pm.identifiedPeers.get(peerIdentity)).toBe(peer1)
    })

    it('Merges peers when an unidentified peer connects with the same identity as an identified webrtc peer', () => {
      const brokerIdentity = mockIdentity('brokering')
      const peerIdentity = webRtcCanInitiateIdentity()
      const pm = new PeerManager(mockLocalPeer(), mockHostsStore())

      const { peer } = getSignalingWebRtcPeer(pm, brokerIdentity, peerIdentity)

      if (peer.state.type === 'DISCONNECTED') {
        throw new Error('Peer should not be DISCONNECTED')
      }
      if (!peer.state.connections.webRtc) {
        throw new Error('Peer should have a WebRTC connection')
      }
      const webRtcConnection = peer.state.connections.webRtc

      // TODO: webRtcConnection.datachannel never actually opens during a test
      // so when peer.send() gets called as part of the onConnect event, it
      // closes the webRTC connection. For now, we'll mock the close function,
      // but in the future, we should mock the datachannel class to make tests
      // more robust -- deekerno
      const closeSpy = jest.spyOn(webRtcConnection, 'close').mockImplementationOnce(() => {})
      webRtcConnection.setState({
        type: 'CONNECTED',
        identity: peerIdentity,
      })
      expect(closeSpy).toBeCalledTimes(1)

      expect(pm.peers.length).toBe(2)
      expect(pm.identifiedPeers.size).toBe(2)
      expect(pm.identifiedPeers.get(peerIdentity)).toBe(peer)

      const unidentifiedPeer = pm.getOrCreatePeer(null)
      const unidentifiedConnection = new WebSocketConnection(
        new ws(''),
        ConnectionDirection.Inbound,
        peer.logger,
      )
      unidentifiedPeer.setWebSocketConnection(unidentifiedConnection)

      expect(pm.peers.length).toBe(3)
      expect(pm.identifiedPeers.size).toBe(2)

      // Connect the unidentified connection to trigger a merge
      unidentifiedConnection.setState({
        type: 'CONNECTED',
        identity: peerIdentity,
      })

      expect(pm.peers.length).toBe(2)
      expect(pm.identifiedPeers.size).toBe(2)
      expect(pm.identifiedPeers.get(peerIdentity)).toBe(peer)
      expect(peer.state).toEqual({
        type: 'CONNECTED',
        identity: peerIdentity,
        connections: {
          webSocket: unidentifiedConnection,
          webRtc: webRtcConnection,
        },
      })
      expect(unidentifiedPeer.state).toEqual({
        type: 'DISCONNECTED',
        identity: peerIdentity,
      })
    })

    it('Merges peers when an unidentified peer connects with the same identity as an identified websocket peer', () => {
      const peerIdentity = webRtcCanInitiateIdentity()
      const pm = new PeerManager(
        mockLocalPeer({ identity: webRtcLocalIdentity() }),
        mockHostsStore(),
      )

      const { peer, connection } = getConnectedPeer(pm, peerIdentity)

      if (peer.state.type === 'DISCONNECTED') {
        throw new Error('Peer should not be DISCONNECTED')
      }
      if (!peer.state.connections.webSocket) {
        throw new Error('Peer should have a WebRTC connection')
      }

      expect(peer.state).toEqual({
        type: 'CONNECTED',
        identity: peerIdentity,
        connections: {
          webSocket: connection,
        },
      })

      expect(pm.peers.length).toBe(1)
      expect(pm.identifiedPeers.size).toBe(1)
      expect(pm.identifiedPeers.get(peerIdentity)).toBe(peer)

      const unidentifiedPeer = pm.getOrCreatePeer(null)
      const unidentifiedConnection = new WebSocketConnection(
        new ws(''),
        ConnectionDirection.Inbound,
        peer.logger,
      )
      unidentifiedPeer.setWebSocketConnection(unidentifiedConnection)

      expect(pm.peers.length).toBe(2)
      expect(pm.identifiedPeers.size).toBe(1)

      // Connect the unidentified connection to trigger a merge
      unidentifiedConnection.setState({
        type: 'CONNECTED',
        identity: peerIdentity,
      })

      expect(pm.peers.length).toBe(1)
      expect(pm.identifiedPeers.size).toBe(1)
      expect(pm.identifiedPeers.get(peerIdentity)).toBe(peer)
      expect(peer.state).toEqual({
        type: 'CONNECTED',
        identity: peerIdentity,
        connections: {
          webSocket: unidentifiedConnection,
        },
      })
      expect(connection.state).toEqual({
        type: 'DISCONNECTED',
      })
    })
  })

  it('Emits onConnectedPeersChanged when a peer enters CONNECTED or DISCONNECTED', () => {
    const pm = new PeerManager(mockLocalPeer(), mockHostsStore())
    const onConnectedPeersChangedMock = jest.fn()
    pm.onConnectedPeersChanged.on(onConnectedPeersChangedMock)

    const { peer: connecting } = getConnectingPeer(pm)
    const { peer: waiting } = getWaitingForIdentityPeer(pm)
    const { peer: connected } = getConnectedPeer(pm, 'peer')

    expect(onConnectedPeersChangedMock).toBeCalledTimes(1)

    // Disconnect all of the peers
    connecting.close()
    waiting.close()
    connected.close()

    expect(onConnectedPeersChangedMock).toBeCalledTimes(2)
  })

  describe('Message: Identity', () => {
    it('Adds the peer to identifiedPeers after receiving a valid identity message', () => {
      const other = mockIdentity('other')
      const pm = new PeerManager(mockLocalPeer(), mockHostsStore())

      expect(pm.identifiedPeers.size).toBe(0)
      expect(pm.peers.length).toBe(0)

      const { peer, connection } = getWaitingForIdentityPeer(pm)

      const identify: Identify = {
        type: InternalMessageType.identity,
        payload: {
          identity: other,
          port: peer.port,
          version: VERSION_PROTOCOL,
          agent: '',

          head: '',
          sequence: 1,
          work: BigInt(0).toString(),
        },
      }
      peer.onMessage.emit(identify, connection)

      expect(pm.identifiedPeers.size).toBe(1)
      expect(pm.peers.length).toBe(1)
      expect(connection.state).toEqual({
        type: 'CONNECTED',
        identity: other,
      })
      expect(peer.state).toEqual({
        type: 'CONNECTED',
        connections: { webSocket: connection },
        identity: other,
      })
    })

    it('Closes the connection when versions do not match', () => {
      const other = mockPrivateIdentity('other')
      const pm = new PeerManager(mockLocalPeer(), mockHostsStore())

      const { peer, connection } = getWaitingForIdentityPeer(pm)

      expect(pm.peers.length).toBe(1)
      const closeSpy = jest.spyOn(connection, 'close')
      const retry = peer.getConnectionRetry(
        ConnectionType.WebSocket,
        ConnectionDirection.Outbound,
      )
      if (retry === null) {
        throw new Error('Retry must not be null')
      }
      const failSpy = jest.spyOn(retry, 'failedConnection')

      const identify: Identify = {
        type: InternalMessageType.identity,
        payload: {
          identity: privateIdentityToIdentity(other),
          version: VERSION_PROTOCOL_MIN - 1,
          agent: '',
          head: '',
          sequence: 1,
          work: BigInt(0).toString(),
          port: peer.port,
        },
      }
      peer.onMessage.emit(identify, connection)

      expect(closeSpy).toBeCalled()
      expect(failSpy).toBeCalledTimes(1)
      expect(pm.peers.length).toBe(1)
      expect(pm.identifiedPeers.size).toBe(0)
    })

    it('Closes the connection when an identity message with an invalid public key is sent', () => {
      const pm = new PeerManager(mockLocalPeer(), mockHostsStore())

      const { peer, connection } = getWaitingForIdentityPeer(pm)

      expect(pm.peers.length).toBe(1)
      const closeSpy = jest.spyOn(connection, 'close')
      const retry = peer.getConnectionRetry(
        ConnectionType.WebSocket,
        ConnectionDirection.Outbound,
      )
      if (retry === null) {
        throw new Error('Retry must not be null')
      }
      const failSpy = jest.spyOn(retry, 'failedConnection')

      const identify: Identify = {
        type: InternalMessageType.identity,
        payload: {
          identity: 'test',
          version: VERSION_PROTOCOL,
          agent: '',

          head: '',
          sequence: 1,
          work: BigInt(0).toString(),
          port: peer.port,
        },
      }
      peer.onMessage.emit(identify, connection)
      expect(closeSpy).toBeCalled()
      expect(failSpy).toBeCalledTimes(1)
      expect(pm.peers.length).toBe(1)
      expect(pm.identifiedPeers.size).toBe(0)
    })

    it('Closes the connection if an unidentified peer returns the local identity', () => {
      const localIdentity = mockPrivateIdentity('local')
      const pm = new PeerManager(mockLocalPeer({ identity: localIdentity }), mockHostsStore())

      expect(pm.identifiedPeers.size).toBe(0)
      expect(pm.peers.length).toBe(0)

      const { connection } = getWaitingForIdentityPeer(pm)

      const identify: Identify = {
        type: InternalMessageType.identity,
        payload: {
          identity: privateIdentityToIdentity(localIdentity),
          port: 9033,
          version: VERSION_PROTOCOL,
          agent: '',

          head: '',
          sequence: 1,
          work: BigInt(0).toString(),
        },
      }
      connection.onMessage.emit(identify)

      expect(connection.state).toEqual({
        type: 'DISCONNECTED',
      })

      expect(pm.peers.length).toBe(0)
      expect(pm.identifiedPeers.size).toBe(0)
    })

    it('Closes the connection if an identified peer returns the local identity', () => {
      const localIdentity = mockPrivateIdentity('local')
      const pm = new PeerManager(mockLocalPeer({ identity: localIdentity }), mockHostsStore())

      const { peer: peer1 } = getConnectedPeer(pm, 'peer1')

      peer1.close()

      const connection = new WebSocketConnection(
        new ws(''),
        ConnectionDirection.Outbound,
        peer1.logger,
      )
      connection.setState({ type: 'WAITING_FOR_IDENTITY' })
      peer1.setWebSocketConnection(connection)
      expect(peer1.state.identity).toBe(peer1.getIdentityOrThrow())

      // Spy on connectionRetry.failedConnection
      const retry = peer1.getConnectionRetry(
        ConnectionType.WebSocket,
        ConnectionDirection.Outbound,
      )
      if (retry === null) {
        throw new Error('Retry must exist')
      }

      const identify: Identify = {
        type: InternalMessageType.identity,
        payload: {
          identity: privateIdentityToIdentity(localIdentity),
          port: 9033,
          version: VERSION_PROTOCOL,
          agent: '',

          head: '',
          sequence: 1,
          work: BigInt(0).toString(),
        },
      }
      connection.onMessage.emit(identify)

      // Peer 1 should be disconnected and WS connection info removed
      expect(connection.state).toEqual({
        type: 'DISCONNECTED',
      })
      expect(peer1.state).toEqual({
        type: 'DISCONNECTED',
        identity: peer1.getIdentityOrThrow(),
      })
      expect(peer1.port).toBeNull()
      expect(peer1.address).toBeNull()
      expect(retry.willNeverRetryConnecting).toBe(true)

      // The peer should be disposed, since there's no alternative way to connect to it
      expect(pm.identifiedPeers.size).toBe(0)
      expect(pm.peers.length).toBe(0)
    })

    it('Moves the connection to another peer if it returns a different identity', () => {
      const peer1Identity = mockIdentity('peer1')
      const peer2Identity = mockIdentity('peer2')
      const pm = new PeerManager(mockLocalPeer(), mockHostsStore())

      const { peer: peer1 } = getConnectedPeer(pm, peer1Identity)

      peer1.close()

      const connection = new WebSocketConnection(
        new ws(''),
        ConnectionDirection.Outbound,
        peer1.logger,
      )
      connection.setState({ type: 'WAITING_FOR_IDENTITY' })
      peer1.setWebSocketConnection(connection)

      const identify: Identify = {
        type: InternalMessageType.identity,
        payload: {
          identity: peer2Identity,
          port: peer1.port,
          version: VERSION_PROTOCOL,
          agent: '',

          head: '',
          sequence: 1,
          work: BigInt(0).toString(),
        },
      }
      connection.onMessage.emit(identify)

      // Should have 2 verified peers
      expect(pm.identifiedPeers.size).toBe(2)
      expect(pm.peers.length).toBe(2)

      // Peer 1 should be disconnected and WS connection info removed
      expect(peer1.state).toEqual({
        type: 'DISCONNECTED',
        identity: peer1Identity,
      })
      expect(peer1.port).toBeNull()
      expect(peer1.address).toBeNull()
      expect(
        peer1.getConnectionRetry(ConnectionType.WebSocket, ConnectionDirection.Outbound)
          ?.willNeverRetryConnecting,
      ).toBe(true)

      const peer2 = pm.getPeer(peer2Identity)
      expect(peer2?.address).toBe('testuri.com')
      expect(peer2?.port).toBe(9033)
      expect(peer2?.state).toEqual({
        type: 'CONNECTED',
        connections: { webSocket: connection },
        identity: peer2Identity,
      })
    })

    it('Closes the connection if the peer has disconnectUntil set', () => {
      const localIdentity = mockPrivateIdentity('local')
      const peerIdentity = mockIdentity('peer')
      const pm = new PeerManager(mockLocalPeer({ identity: localIdentity }), mockHostsStore())

      const { peer } = getConnectedPeer(pm, peerIdentity)
      peer.close()
      expect(peer.state).toEqual({ type: 'DISCONNECTED', identity: peerIdentity })
      peer.localRequestedDisconnectUntil = Number.MAX_SAFE_INTEGER

      const { connection } = getWaitingForIdentityPeer(pm)

      const sendSpy = jest.spyOn(connection, 'send')
      const id: Identify = {
        type: InternalMessageType.identity,
        payload: {
          identity: peerIdentity,
          version: VERSION_PROTOCOL,
          agent: '',

          head: '',
          sequence: 1,
          work: BigInt(0).toString(),
          port: 9033,
        },
      }
      connection.onMessage.emit(id)

      const response: DisconnectingMessage = {
        type: InternalMessageType.disconnecting,
        payload: {
          sourceIdentity: privateIdentityToIdentity(localIdentity),
          destinationIdentity: peerIdentity,
          reason: DisconnectingReason.Congested,
          disconnectUntil: peer.localRequestedDisconnectUntil,
        },
      }
      expect(sendSpy).toBeCalledWith(response)

      expect(connection.state).toEqual({
        type: 'DISCONNECTED',
      })
    })
  })

  describe('Message: SignalRequest', () => {
    it('Forwards SignalRequest message intended for another peer', () => {
      const pm = new PeerManager(mockLocalPeer(), mockHostsStore())

      const { peer: destinationPeer } = getConnectedPeer(pm, webRtcCannotInitiateIdentity())
      const { connection: sourcePeerConnection, peer: sourcePeer } = getConnectedPeer(
        pm,
        webRtcCanInitiateIdentity(),
      )

      expect(
        canInitiateWebRTC(
          sourcePeer.getIdentityOrThrow(),
          destinationPeer.getIdentityOrThrow(),
        ),
      ).toBe(false)

      const signal: SignalRequest = {
        type: InternalMessageType.signalRequest,
        payload: {
          sourceIdentity: sourcePeer.getIdentityOrThrow(),
          destinationIdentity: destinationPeer.getIdentityOrThrow(),
        },
      }

      const sendSpy = jest.spyOn(destinationPeer, 'send')
      sourcePeer.onMessage.emit(signal, sourcePeerConnection)
      expect(sendSpy).toBeCalledWith(signal)
    })

    it('Drops SignalRequest message originating from an different peer than sourceIdentity', () => {
      const pm = new PeerManager(mockLocalPeer(), mockHostsStore())

      const { peer: peer1 } = getConnectedPeer(pm)
      const { peer: peer2 } = getConnectedPeer(pm)
      const { connection: peer3Connection, peer: peer3 } = getConnectedPeer(pm)

      const signal: SignalRequest = {
        type: InternalMessageType.signalRequest,
        payload: {
          sourceIdentity: peer1.getIdentityOrThrow(),
          destinationIdentity: peer2.getIdentityOrThrow(),
        },
      }

      const sendSpy1 = jest.spyOn(peer1, 'send')
      const sendSpy2 = jest.spyOn(peer2, 'send')

      peer3.onMessage.emit(signal, peer3Connection)
      expect(sendSpy1).not.toBeCalled()
      expect(sendSpy2).not.toBeCalled()
    })

    it('reject SignalRequest when source peer should initiate', () => {
      const pm = new PeerManager(
        mockLocalPeer({ identity: webRtcLocalIdentity() }),
        mockHostsStore(),
      )
      const initWebRtcConnectionMock = jest.fn()
      pm['initWebRtcConnection'] = initWebRtcConnectionMock

      const { peer, connection } = getConnectedPeer(pm, webRtcCannotInitiateIdentity())

      expect(canInitiateWebRTC(peer.getIdentityOrThrow(), pm.localPeer.publicIdentity)).toBe(
        true,
      )

      // Emit the signaling message
      const message: SignalRequest = {
        type: InternalMessageType.signalRequest,
        payload: {
          sourceIdentity: peer.getIdentityOrThrow(),
          destinationIdentity: pm.localPeer.publicIdentity,
        },
      }

      peer.onMessage.emit(message, connection)
      expect(initWebRtcConnectionMock).toBeCalledTimes(0)
    })

    it('Initiates webRTC connection when request intended for local peer', () => {
      const pm = new PeerManager(
        mockLocalPeer({ identity: webRtcLocalIdentity() }),
        mockHostsStore(),
      )
      const initWebRtcConnectionMock = jest.fn()
      pm['initWebRtcConnection'] = initWebRtcConnectionMock

      const { peer, connection } = getConnectedPeer(pm, webRtcCanInitiateIdentity())

      expect(canInitiateWebRTC(peer.getIdentityOrThrow(), pm.localPeer.publicIdentity)).toBe(
        false,
      )

      // Emit the signaling message
      const message: SignalRequest = {
        type: InternalMessageType.signalRequest,
        payload: {
          sourceIdentity: peer.getIdentityOrThrow(),
          destinationIdentity: pm.localPeer.publicIdentity,
        },
      }

      peer.onMessage.emit(message, connection)
      expect(initWebRtcConnectionMock).toBeCalledTimes(1)
      expect(initWebRtcConnectionMock).toBeCalledWith(peer, true)
      expect(pm['getBrokeringPeer'](peer)).toEqual(peer)
    })

    it('Sends a disconnect message if we are at max peers', () => {
      const pm = new PeerManager(
        mockLocalPeer({ identity: webRtcLocalIdentity() }),
        mockHostsStore(),
        undefined,
        undefined,
        1,
      )

      const { connection: peer1Connection, peer: peer1 } = getConnectedPeer(pm, 'peer')

      const message: SignalRequest = {
        type: InternalMessageType.signalRequest,
        payload: {
          sourceIdentity: webRtcCanInitiateIdentity(),
          destinationIdentity: pm.localPeer.publicIdentity,
        },
      }

      const sendSpy = jest.spyOn(peer1, 'send')

      peer1.onMessage.emit(message, peer1Connection)

      const reply: DisconnectingMessage = {
        type: InternalMessageType.disconnecting,
        payload: {
          disconnectUntil: expect.any(Number),
          reason: DisconnectingReason.Congested,
          sourceIdentity: pm.localPeer.publicIdentity,
          destinationIdentity: webRtcCanInitiateIdentity(),
        },
      }

      expect(sendSpy).toBeCalledWith(reply)
    })

    it('Does not send a disconnect message if we are at max peers but we have an existing connection to the peer', () => {
      const pm = new PeerManager(
        mockLocalPeer({ identity: webRtcLocalIdentity() }),
        mockHostsStore(),
        undefined,
        undefined,
        1,
      )

      const { connection: peer1Connection, peer: peer1 } = getConnectedPeer(pm, 'peer')
      getConnectedPeer(pm, webRtcCanInitiateIdentity())

      const message: SignalRequest = {
        type: InternalMessageType.signalRequest,
        payload: {
          sourceIdentity: webRtcCanInitiateIdentity(),
          destinationIdentity: pm.localPeer.publicIdentity,
        },
      }

      const sendSpy = jest.spyOn(peer1, 'send')

      peer1.onMessage.emit(message, peer1Connection)

      expect(sendSpy).not.toBeCalled()
    })
  })

  describe('Message: Signal', () => {
    it('Forwards signaling messages intended for another peer', () => {
      const peer1Identity = mockIdentity('peer1')
      const peer2Identity = mockIdentity('peer2')
      const pm = new PeerManager(mockLocalPeer(), mockHostsStore())

      const { connection: peer1Connection, peer: peer1 } = getConnectedPeer(pm, peer1Identity)
      const { peer: peer2 } = getConnectedPeer(pm, peer2Identity)

      const signal: Signal = {
        type: InternalMessageType.signal,
        payload: {
          sourceIdentity: peer1Identity,
          destinationIdentity: peer2Identity,
          nonce: '',
          signal: '',
        },
      }

      const sendSpy = jest.spyOn(peer2, 'send')
      peer1.onMessage.emit(signal, peer1Connection)
      expect(sendSpy).toBeCalledWith(signal)
    })

    it('Drops signaling messages originating from an different peer than sourceIdentity', () => {
      const peer1Identity = mockIdentity('peer1')
      const peer2Identity = mockIdentity('peer2')
      const peer3Identity = mockIdentity('peer3')
      const pm = new PeerManager(mockLocalPeer(), mockHostsStore())

      const { peer: peer1 } = getConnectedPeer(pm, peer1Identity)
      const { peer: peer2 } = getConnectedPeer(pm, peer2Identity)
      const { connection: peer3Connection, peer: peer3 } = getConnectedPeer(pm, peer3Identity)

      const signal: Signal = {
        type: InternalMessageType.signal,
        payload: {
          sourceIdentity: peer1Identity,
          destinationIdentity: peer2Identity,
          nonce: '',
          signal: '',
        },
      }

      const sendSpy1 = jest.spyOn(peer1, 'send')
      const sendSpy2 = jest.spyOn(peer2, 'send')
      peer3.onMessage.emit(signal, peer3Connection)
      expect(sendSpy1).not.toBeCalled()
      expect(sendSpy2).not.toBeCalled()
    })

    it('Sends a disconnect message if we are at max peers', () => {
      const pm = new PeerManager(
        mockLocalPeer({ identity: webRtcLocalIdentity() }),
        mockHostsStore(),
        undefined,
        undefined,
        1,
      )

      const { connection: peer1Connection, peer: peer1 } = getConnectedPeer(pm, 'peer')

      const message: Signal = {
        type: InternalMessageType.signal,
        payload: {
          sourceIdentity: webRtcCannotInitiateIdentity(),
          destinationIdentity: pm.localPeer.publicIdentity,
          nonce: '',
          signal: '',
        },
      }

      const sendSpy = jest.spyOn(peer1, 'send')

      peer1.onMessage.emit(message, peer1Connection)

      const reply: DisconnectingMessage = {
        type: InternalMessageType.disconnecting,
        payload: {
          disconnectUntil: expect.any(Number),
          reason: DisconnectingReason.Congested,
          sourceIdentity: pm.localPeer.publicIdentity,
          destinationIdentity: webRtcCannotInitiateIdentity(),
        },
      }

      expect(sendSpy).toBeCalledWith(reply)
    })

    it('Does not send a disconnect message if we are at max peers but we have an existing connection to the peer', () => {
      const pm = new PeerManager(
        mockLocalPeer({ identity: webRtcLocalIdentity() }),
        mockHostsStore(),
        undefined,
        undefined,
        1,
      )

      const { connection: peer1Connection, peer: peer1 } = getConnectedPeer(pm, 'peer')
      getConnectedPeer(pm, webRtcCannotInitiateIdentity())

      const message: Signal = {
        type: InternalMessageType.signal,
        payload: {
          sourceIdentity: webRtcCannotInitiateIdentity(),
          destinationIdentity: pm.localPeer.publicIdentity,
          nonce: '',
          signal: '',
        },
      }

      const sendSpy = jest.spyOn(peer1, 'send')

      peer1.onMessage.emit(message, peer1Connection)

      expect(sendSpy).not.toBeCalled()
    })

    it('Decrypts signaling data intended for local peer', async () => {
      const brokeringPeerIdentity = mockPrivateIdentity('brokering')

      const pm = new PeerManager(
        mockLocalPeer({ identity: webRtcLocalIdentity() }),
        mockHostsStore(),
      )

      const { connection, brokeringConnection, brokeringPeer } = getSignalingWebRtcPeer(
        pm,
        privateIdentityToIdentity(brokeringPeerIdentity),
        webRtcCanInitiateIdentity(),
      )

      const signalSpy = jest.spyOn(connection, 'signal')

      // Emit the signaling message
      const signal: Signal = {
        type: InternalMessageType.signal,
        payload: {
          sourceIdentity: webRtcCanInitiateIdentity(),
          destinationIdentity: privateIdentityToIdentity(webRtcLocalIdentity()),
          nonce: 'boxMessageNonce',
          signal: 'boxMessageMessage',
        },
      }
      await brokeringPeer.onMessage.emitAsync(signal, brokeringConnection)

      expect(signalSpy).toBeCalledTimes(1)
      expect(signalSpy).toBeCalledWith({
        type: 'candidate',
        candidate: {
          candidate: '',
          sdpMLineIndex: 0,
          sdpMid: '0',
        },
      })
    })

    it('Disconnects if decrypting signaling data fails', async () => {
      const brokeringPeerIdentity = mockIdentity('brokering')

      // Return null from the unboxMessage function
      mocked(encryption.unboxMessage).mockReturnValueOnce(null)

      const pm = new PeerManager(
        mockLocalPeer({ identity: webRtcLocalIdentity() }),
        mockHostsStore(),
      )
      const { connection, brokeringConnection, brokeringPeer } = getSignalingWebRtcPeer(
        pm,
        brokeringPeerIdentity,
        webRtcCanInitiateIdentity(),
      )

      const signalSpy = jest.spyOn(connection, 'signal')
      const closeSpy = jest.spyOn(connection, 'close')

      // Emit the signaling message
      const signal: Signal = {
        type: InternalMessageType.signal,
        payload: {
          sourceIdentity: webRtcCanInitiateIdentity(),
          destinationIdentity: privateIdentityToIdentity(webRtcLocalIdentity()),
          nonce: 'boxMessageNonce',
          signal: 'boxMessageMessage',
        },
      }
      await brokeringPeer.onMessage.emitAsync(signal, brokeringConnection)

      expect(signalSpy).not.toBeCalled()
      expect(closeSpy).toBeCalled()
    })

    it('Disconnects if decoding signaling data fails', async () => {
      const brokeringPeerIdentity = mockIdentity('brokering')

      // Return something that's not JSON from the unboxMessage function
      mocked(encryption.unboxMessage).mockReturnValueOnce('test')

      const pm = new PeerManager(
        mockLocalPeer({ identity: webRtcLocalIdentity() }),
        mockHostsStore(),
      )
      const { connection, brokeringConnection, brokeringPeer } = getSignalingWebRtcPeer(
        pm,
        brokeringPeerIdentity,
        webRtcCanInitiateIdentity(),
      )

      const signalSpy = jest.spyOn(connection, 'signal')
      const closeSpy = jest.spyOn(connection, 'close')

      // Emit the signaling message
      const signal: Signal = {
        type: InternalMessageType.signal,
        payload: {
          sourceIdentity: webRtcCanInitiateIdentity(),
          destinationIdentity: privateIdentityToIdentity(webRtcLocalIdentity()),
          nonce: 'boxMessageNonce',
          signal: 'boxMessageMessage',
        },
      }
      await brokeringPeer.onMessage.emitAsync(signal, brokeringConnection)

      expect(signalSpy).not.toBeCalled()
      expect(closeSpy).toBeCalled()
    })
  })

  describe('Message: PeerListRequest', () => {
    it('Sends a peer list message in response', () => {
      const peerIdentity = mockIdentity('peer')

      const pm = new PeerManager(mockLocalPeer(), mockHostsStore())
      const { connection, peer } = getConnectedPeer(pm, peerIdentity)

      expect(pm.peers.length).toBe(1)
      expect(pm.identifiedPeers.size).toBe(1)

      const peerListRequest: PeerListRequest = {
        type: InternalMessageType.peerListRequest,
      }

      const peerList: PeerList = {
        type: InternalMessageType.peerList,
        payload: {
          connectedPeers: [
            {
              identity: peer.getIdentityOrThrow(),
              address: peer.address,
              port: peer.port,
            },
          ],
        },
      }

      const sendToSpy = jest.spyOn(pm, 'sendTo')
      peer.onMessage.emit(peerListRequest, connection)
      expect(sendToSpy).toBeCalledTimes(1)
      expect(sendToSpy).toHaveBeenCalledWith(peer, peerList)
    })
  })

  describe('Message: PeerList', () => {
    it('Does not add local identity to knownPeers', () => {
      const localIdentity = mockPrivateIdentity('local')
      const peerIdentity = mockIdentity('peer')

      const pm = new PeerManager(mockLocalPeer({ identity: localIdentity }), mockHostsStore())

      const { connection, peer } = getConnectedPeer(pm, peerIdentity)

      expect(peer.knownPeers.size).toBe(0)

      const peerList: PeerList = {
        type: InternalMessageType.peerList,
        payload: {
          connectedPeers: [
            {
              identity: privateIdentityToIdentity(localIdentity),
              address: peer.address,
              port: peer.port,
            },
          ],
        },
      }
      peer.onMessage.emit(peerList, connection)
      expect(peer.knownPeers.size).toBe(0)
    })

    it('Does not emit onKnownPeersChanged when peer list stays the same', () => {
      const peerIdentity = mockIdentity('peer')
      const newPeerIdentity = mockIdentity('new')

      const pm = new PeerManager(mockLocalPeer(), mockHostsStore())

      const { connection, peer } = getConnectedPeer(pm, peerIdentity)

      expect(pm.peers.length).toBe(1)
      expect(pm.identifiedPeers.size).toBe(1)
      expect(peer.knownPeers.size).toBe(0)

      const peerList: PeerList = {
        type: InternalMessageType.peerList,
        payload: {
          connectedPeers: [
            {
              identity: newPeerIdentity,
              address: peer.address,
              port: peer.port,
            },
          ],
        },
      }
      const onKnownPeersChangedSpy = jest.spyOn(peer.onKnownPeersChanged, 'emit')
      peer.onMessage.emit(peerList, connection)
      peer.onMessage.emit(peerList, connection)

      expect(onKnownPeersChangedSpy).toBeCalledTimes(1)
    })

    it('Links peers when adding a new known peer', () => {
      const peerIdentity = mockIdentity('peer')
      const newPeerIdentity = mockIdentity('new')

      const pm = new PeerManager(mockLocalPeer(), mockHostsStore())

      const { connection, peer } = getConnectedPeer(pm, peerIdentity)

      expect(pm.peers.length).toBe(1)
      expect(pm.identifiedPeers.size).toBe(1)
      expect(peer.knownPeers.size).toBe(0)

      // Clear onKnownPeersChanged handlers to avoid any side effects
      pm.onKnownPeersChanged.clear()

      const peerList: PeerList = {
        type: InternalMessageType.peerList,
        payload: {
          connectedPeers: [
            {
              identity: newPeerIdentity,
              address: peer.address,
              port: peer.port,
            },
          ],
        },
      }
      peer.onMessage.emit(peerList, connection)

      expect(peer.knownPeers.size).toBe(1)
      expect(pm.peers.length).toBe(2)
      expect(pm.identifiedPeers.size).toBe(2)

      const newPeer = peer.knownPeers.get(newPeerIdentity)
      expect(newPeer).toBeDefined()
      if (!newPeer) {
        throw new Error('Peer must be defined')
      }
      expect(newPeer.state).toEqual({
        type: 'DISCONNECTED',
        identity: newPeerIdentity,
      })
      expect(newPeer.knownPeers.size).toBe(1)
      expect(newPeer.knownPeers.get(peerIdentity)).toBe(peer)

      expect(pm.identifiedPeers.size).toBe(2)
      expect(pm.identifiedPeers.get(peerIdentity)).toBe(peer)
      expect(pm.identifiedPeers.get(newPeerIdentity)).toBe(newPeer)
    })

    it(`Disposes of peers if they are no longer linked to the network`, () => {
      const peerIdentity = mockIdentity('peer')
      const newPeerIdentity = mockIdentity('new')

      const pm = new PeerManager(mockLocalPeer(), mockHostsStore())

      const { connection, peer } = getConnectedPeer(pm, peerIdentity)

      expect(pm.peers.length).toBe(1)
      expect(pm.identifiedPeers.size).toBe(1)
      expect(peer.knownPeers.size).toBe(0)

      // Clear onKnownPeersChanged handlers to avoid any side effects
      pm.onKnownPeersChanged.clear()

      const peerList: PeerList = {
        type: InternalMessageType.peerList,
        payload: {
          connectedPeers: [
            {
              identity: newPeerIdentity,
              address: peer.address,
              port: peer.port,
            },
          ],
        },
      }
      peer.onMessage.emit(peerList, connection)

      expect(peer.knownPeers.size).toBe(1)
      expect(pm.peers.length).toBe(2)
      expect(pm.identifiedPeers.size).toBe(2)

      // Indicate that we can't initiate a WebSocket connection to the new peer
      const newPeer = pm.getPeerOrThrow(newPeerIdentity)
      newPeer
        .getConnectionRetry(ConnectionType.WebSocket, ConnectionDirection.Outbound)
        ?.neverRetryConnecting()

      // Send another peer list without that peer
      const newPeerList: PeerList = {
        type: InternalMessageType.peerList,
        payload: {
          connectedPeers: [],
        },
      }
      peer.onMessage.emit(newPeerList, connection)

      // newPeer should be disposed
      expect(pm.peers).toHaveLength(1)
      expect(pm.identifiedPeers.size).toBe(1)
      expect(pm.identifiedPeers.get(peerIdentity)).toBe(peer)
      expect(pm.identifiedPeers.get(newPeerIdentity)).toBeUndefined()
    })
  })

  describe('Message: Disconnect', () => {
    it('Drops disconnect messages originating from an different peer than sourceIdentity', () => {
      const peer1Identity = mockIdentity('peer1')
      const peer2Identity = mockIdentity('peer2')
      const peer3Identity = mockIdentity('peer3')
      const pm = new PeerManager(mockLocalPeer(), mockHostsStore())

      const { peer: peer1 } = getConnectedPeer(pm, peer1Identity)
      const { peer: peer2 } = getConnectedPeer(pm, peer2Identity)
      const { connection: peer3Connection, peer: peer3 } = getConnectedPeer(pm, peer3Identity)

      const signal: DisconnectingMessage = {
        type: InternalMessageType.disconnecting,
        payload: {
          sourceIdentity: peer1Identity,
          destinationIdentity: peer2Identity,
          disconnectUntil: Number.MAX_SAFE_INTEGER,
          reason: DisconnectingReason.ShuttingDown,
        },
      }

      const sendSpy1 = jest.spyOn(peer1, 'send')
      const sendSpy2 = jest.spyOn(peer2, 'send')
      peer3.onMessage.emit(signal, peer3Connection)
      expect(sendSpy1).not.toBeCalled()
      expect(sendSpy2).not.toBeCalled()
    })

    it('Should set peerRequestedDisconnectUntil on unidentified Peer', () => {
      const localPeer = mockLocalPeer()
      const pm = new PeerManager(localPeer, mockHostsStore())
      const peerIdentity = mockIdentity('peer')
      const { peer, connection } = getConnectingPeer(pm)
      expect(peer.peerRequestedDisconnectUntil).toBeNull()

      const disconnectMessage: DisconnectingMessage = {
        type: InternalMessageType.disconnecting,
        payload: {
          sourceIdentity: peerIdentity,
          destinationIdentity: localPeer.publicIdentity,
          disconnectUntil: Number.MAX_SAFE_INTEGER,
          reason: DisconnectingReason.ShuttingDown,
        },
      }

      connection.onMessage.emit(disconnectMessage)

      // Even though identity is included in the message, it shouldn't be set on the
      // peer before an Identity message is received.
      expect(peer.state.identity).toBeNull()

      expect(peer.peerRequestedDisconnectUntil).toBe(Number.MAX_SAFE_INTEGER)
      expect(peer.state.type).toEqual('DISCONNECTED')
    })

    it('Should set peerRequestedDisconnectUntil on CONNECTED Peer when sender is not sourceIdentity', () => {
      const localPeer = mockLocalPeer({ identity: webRtcLocalIdentity() })
      const pm = new PeerManager(localPeer, mockHostsStore())

      const { peer, brokeringConnection, brokeringPeer } = getSignalingWebRtcPeer(
        pm,
        mockIdentity('brokering'),
        webRtcCanInitiateIdentity(),
      )

      const disconnectMessage: DisconnectingMessage = {
        type: InternalMessageType.disconnecting,
        payload: {
          sourceIdentity: webRtcCanInitiateIdentity(),
          destinationIdentity: localPeer.publicIdentity,
          disconnectUntil: Number.MAX_SAFE_INTEGER,
          reason: DisconnectingReason.ShuttingDown,
        },
      }

      expect(peer.state.type).toEqual('CONNECTING')
      expect(brokeringPeer.state.type).toEqual('CONNECTED')

      brokeringConnection.onMessage.emit(disconnectMessage)

      expect(peer.state.type).toEqual('DISCONNECTED')
      expect(peer.peerRequestedDisconnectReason).toEqual(DisconnectingReason.ShuttingDown)
      expect(peer.peerRequestedDisconnectUntil).toEqual(Number.MAX_SAFE_INTEGER)
      expect(brokeringPeer.state.type).toEqual('CONNECTED')
    })

    it('Should set peerRequestedDisconnectUntil on CONNECTED Peer when sender is sourceIdentity', () => {
      const localPeer = mockLocalPeer()
      const pm = new PeerManager(localPeer, mockHostsStore())
      const peerIdentity = mockIdentity('peer')
      const { peer, connection } = getConnectedPeer(pm, peerIdentity)
      expect(peer.peerRequestedDisconnectUntil).toBeNull()

      const disconnectMessage: DisconnectingMessage = {
        type: InternalMessageType.disconnecting,
        payload: {
          sourceIdentity: peerIdentity,
          destinationIdentity: localPeer.publicIdentity,
          disconnectUntil: Number.MAX_SAFE_INTEGER,
          reason: DisconnectingReason.ShuttingDown,
        },
      }

      connection.onMessage.emit(disconnectMessage)

      expect(peer.peerRequestedDisconnectUntil).toBe(Number.MAX_SAFE_INTEGER)
      expect(peer.state.type).toEqual('DISCONNECTED')
    })
  })
})
