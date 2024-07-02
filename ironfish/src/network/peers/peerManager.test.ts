/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

jest.mock('ws')

import ws from 'ws'
import { Assert } from '../../assert'
import { canInitiateWebRTC, privateIdentityToIdentity } from '../identity'
import { DisconnectingMessage, DisconnectingReason } from '../messages/disconnecting'
import { IdentifyMessage } from '../messages/identify'
import { NetworkMessage } from '../messages/networkMessage'
import { PeerListMessage } from '../messages/peerList'
import { PeerListRequestMessage } from '../messages/peerListRequest'
import { SignalMessage } from '../messages/signal'
import { SignalRequestMessage } from '../messages/signalRequest'
import {
  getConnectedPeer,
  getConnectingPeer,
  getSignalingWebRtcPeer,
  getWaitingForIdentityPeer,
  mockIdentity,
  mockLocalPeer,
  mockPeerStore,
  mockPrivateIdentity,
  webRtcCanInitiateIdentity,
  webRtcCannotInitiateIdentity,
  webRtcLocalIdentity,
} from '../testUtilities'
import { NetworkMessageType } from '../types'
import { formatWebSocketAddress } from '../utils'
import { VERSION_PROTOCOL, VERSION_PROTOCOL_MIN } from '../version'
import {
  Connection,
  ConnectionDirection,
  ConnectionType,
  WebRtcConnection,
  WebSocketConnection,
} from './connections'
import { BAN_SCORE, Peer } from './peer'
import { defaultFeatures } from './peerFeatures'
import { PeerManager } from './peerManager'

jest.useFakeTimers()

describe('PeerManager', () => {
  const localPeer = mockLocalPeer({ identity: webRtcLocalIdentity() })
  jest
    .spyOn(localPeer, 'boxMessage')
    .mockReturnValue({ nonce: 'boxMessageNonce', boxedMessage: 'boxMessageMessage' })

  it('should handle duplicate connections from the same peer', () => {
    const localPeer = mockLocalPeer({ identity: webRtcLocalIdentity() })
    const peers = new PeerManager(localPeer, mockPeerStore())

    const { peer: peerOut, connection: connectionOut } = getWaitingForIdentityPeer(
      peers,
      ConnectionDirection.Outbound,
    )
    const { peer: peerIn1, connection: connectionIn1 } = getWaitingForIdentityPeer(
      peers,
      ConnectionDirection.Inbound,
    )
    const { peer: peerIn2, connection: connectionIn2 } = getWaitingForIdentityPeer(
      peers,
      ConnectionDirection.Inbound,
    )

    // Create identity and message for all peers
    const identity = webRtcCannotInitiateIdentity()
    const message = new IdentifyMessage({
      agent: '',
      head: Buffer.alloc(32, 0),
      identity: identity,
      port: null,
      sequence: 1,
      version: VERSION_PROTOCOL,
      work: BigInt(0),
      networkId: localPeer.networkId,
      genesisBlockHash: localPeer.chain.genesis.hash,
      features: defaultFeatures(),
    })

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
      type: 'DISCONNECTED',
      identity: identity,
    })
    expect(peerIn1.state).toMatchObject({
      type: 'CONNECTED',
      identity: identity,
      connections: { webSocket: connectionIn1 },
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
    expect(peers.peers.length).toBe(1)
    // Connections
    expect(connectionOut.state.type).toEqual('DISCONNECTED')
    expect(connectionIn1.state.type).toEqual('CONNECTED')
    expect(connectionIn2.state.type).toEqual('DISCONNECTED')
    // Check Peers
    expect(peerOut.state).toMatchObject({
      type: 'DISCONNECTED',
      identity: identity,
    })
    expect(peerIn1.state).toMatchObject({
      type: 'CONNECTED',
      identity: identity,
      connections: { webSocket: connectionIn1 },
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

  describe('Should remove peer candidates without identity when identity is found', () => {
    it('When peer becomes CONNECTED', () => {
      const peers = new PeerManager(mockLocalPeer(), mockPeerStore())

      const peerIdentity = mockIdentity('peer')
      const peer = peers.connectToWebSocketAddress({
        host: 'testuri',
        port: 9033,
      })

      Assert.isNotUndefined(peer)

      const address = formatWebSocketAddress(peer.wsAddress)
      const candidate = address ? peers.peerCandidates.get(address) : undefined
      expect(candidate).not.toBeUndefined()
      if (peer.state.type === 'DISCONNECTED') {
        throw new Error('Peer should not be disconnected')
      }

      const connection = peer.state.connections.webSocket
      Assert.isNotUndefined(connection)

      connection.setState({ type: 'CONNECTED', identity: peerIdentity })

      expect(peers.peerCandidates.size).toBe(1)
      const pc = peers.peerCandidates.get(peerIdentity)
      expect(pc).not.toBeUndefined()
    })

    it('When receiving a peer list with a matching address', () => {
      const peers = new PeerManager(mockLocalPeer(), mockPeerStore())

      // Create a websocket peer
      const peerIdentity = mockIdentity('peer')
      const connectedPeerIdentity = mockIdentity('connected')
      const peer = peers.connectToWebSocketAddress({
        host: 'testuri',
        port: 9033,
      })
      Assert.isNotUndefined(peer)

      const address = formatWebSocketAddress(peer.wsAddress)
      const candidate = address ? peers.peerCandidates.get(address) : undefined
      expect(candidate).not.toBeUndefined()
      peer.close()

      // Create a connected peer
      const { peer: connectedPeer, connection } = getConnectedPeer(peers, connectedPeerIdentity)

      connectedPeer.onMessage.emit(
        new PeerListMessage([
          {
            address: 'testuri',
            port: 9033,
            identity: Buffer.from(peerIdentity, 'base64'),
          },
        ]),
        connection,
      )

      expect(peers.peerCandidates.size).toBe(2)
      const peerCandidate = peers.peerCandidates.get(peerIdentity)
      const connectedPeerCandidate = peers.peerCandidates.get(connectedPeerIdentity)
      expect(peerCandidate).not.toBeUndefined()
      expect(connectedPeerCandidate).not.toBeUndefined()
    })
  })

  it('Sends identity when a connection is successfully made', () => {
    const localIdentity = mockPrivateIdentity('local')
    const pm = new PeerManager(mockLocalPeer({ identity: localIdentity }), mockPeerStore())

    const { peer, connection } = getConnectingPeer(pm)

    const sendSpy = jest.spyOn(connection, 'send')

    connection.setState({ type: 'WAITING_FOR_IDENTITY' })

    expect(peer.state).toEqual({
      type: 'CONNECTING',
      identity: null,
      connections: { webSocket: connection },
    })

    Assert.isNotNull(pm.localPeer.chain.head)

    expect(sendSpy.mock.calls[0][0]).toMatchObject({
      identity: privateIdentityToIdentity(localIdentity),
      version: VERSION_PROTOCOL,
      agent: pm.localPeer.agent,
      head: pm.localPeer.chain.head.hash,
      sequence: Number(pm.localPeer.chain.head.sequence),
      work: pm.localPeer.chain.head.work,
    })
  })

  it('should disconnect connection on CONNECTED', () => {
    const localPeer = mockLocalPeer()
    const peers = new PeerManager(localPeer, mockPeerStore())

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
        type: NetworkMessageType.Disconnecting,
      }),
    )
    expect(sendSpyPeer3).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NetworkMessageType.Disconnecting,
      }),
    )

    expect(peer1.state.type).toEqual('DISCONNECTED')
    expect(peer2.state.type).toEqual('DISCONNECTED')
    expect(peer3.state.type).toEqual('DISCONNECTED')
  })

  describe('banning', () => {
    it('Should add the peer identity to PeerManager.banned when banPeer is called', () => {
      const localPeer = mockLocalPeer()
      const peers = new PeerManager(localPeer, mockPeerStore())

      const { peer } = getConnectedPeer(peers)

      peers.banPeer(peer, 'UNKNOWN')

      expect(peers.banned.has(peer.getIdentityOrThrow())).toBe(true)
    })

    it('Should add the peer identity to PeerManager.banned when punished with BAN_SCORE.MAX', () => {
      const localPeer = mockLocalPeer()
      const peers = new PeerManager(localPeer, mockPeerStore())

      const { peer } = getConnectedPeer(peers)

      peer.punish(BAN_SCORE.MAX, 'TESTING')

      expect(peers.banned.has(peer.getIdentityOrThrow())).toBe(true)
    })
  })

  describe('connect', () => {
    it('Creates a peer and adds it to unidentifiedConnections', () => {
      const pm = new PeerManager(mockLocalPeer(), mockPeerStore())
      expect(pm.peers.length).toBe(0)

      const peer = pm.connectToWebSocketAddress({
        host: 'testuri',
        port: 9033,
      })

      Assert.isNotUndefined(peer)

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

      const pm = new PeerManager(localPeer, mockPeerStore())
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

      expect(sendSpy).toHaveBeenCalledTimes(1)
      expect(sendSpy).toHaveBeenCalledWith(
        new SignalMessage({
          sourceIdentity: privateIdentityToIdentity(webRtcLocalIdentity()),
          destinationIdentity: webRtcCanInitiateIdentity(),
          nonce: 'boxMessageNonce',
          signal: 'boxMessageMessage',
        }),
      )
    })

    it('Attempts to establish a WebSocket connection to a peer with a webSocketAddress', () => {
      const peer1Identity = mockIdentity('peer1')
      const peer2Identity = mockIdentity('peer2')
      const pm = new PeerManager(mockLocalPeer(), mockPeerStore())

      // Create the peers
      getConnectedPeer(pm, peer1Identity)
      const peer2 = pm.getOrCreatePeer(peer2Identity)

      // Link the peers
      pm.peerCandidates.addFromPeerList(peer2Identity, {
        wsAddress: null,
        identity: peer1Identity,
      })
      pm.peerCandidates.addFromPeerList(peer1Identity, {
        wsAddress: null,
        identity: peer2Identity,
      })

      // Verify peer2 is not connected
      peer2.wsAddress = { host: 'testuri', port: 9033 }
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
        mockPeerStore(),
      )

      // Create the peers
      const { peer: brokeringPeer } = getConnectedPeer(peers)
      const targetPeer = peers.getOrCreatePeer(webRtcCanInitiateIdentity())
      expect(targetPeer.state.type).toEqual('DISCONNECTED')

      // Link the peers
      peers.peerCandidates.addFromPeerList(targetPeer.getIdentityOrThrow(), {
        wsAddress: null,
        identity: brokeringPeer.getIdentityOrThrow(),
      })
      peers.peerCandidates.addFromPeerList(brokeringPeer.getIdentityOrThrow(), {
        wsAddress: null,
        identity: targetPeer.getIdentityOrThrow(),
      })

      peers.connectToWebRTC(targetPeer)

      expect(targetPeer.state).toMatchObject({
        type: 'CONNECTING',
        connections: { webRtc: expect.any(WebRtcConnection) },
      })
    })

    it('Can establish a WebRTC connection to a peer using an existing WebSocket connection to the same peer', async () => {
      const pm = new PeerManager(localPeer, mockPeerStore())

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

      const sendSpy = jest.mocked(connection.send)

      await peer.state.connections.webRtc.onSignal.emitAsync({
        type: 'candidate',
        candidate: {
          candidate: '',
          sdpMLineIndex: 0,
          sdpMid: '0',
        },
      })

      expect(sendSpy).toHaveBeenCalledWith(
        new SignalMessage({
          sourceIdentity: 'bGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGw=',
          destinationIdentity: 'a2tra2tra2tra2tra2tra2tra2tra2tra2tra2tra2s=',
          nonce: 'boxMessageNonce',
          signal: 'boxMessageMessage',
        }),
      )
    })

    it('Attempts to request WebRTC signaling through brokering peer', () => {
      const peers = new PeerManager(
        mockLocalPeer({ identity: webRtcLocalIdentity() }),
        mockPeerStore(),
      )

      // Create the peer to broker the connection through
      const { peer: brokeringPeer } = getConnectedPeer(peers)
      const brokerPeerSendMock = jest.fn<(message: NetworkMessage) => Connection | null>()
      brokeringPeer.send = brokerPeerSendMock

      // Create the peer to connect to WebRTC through
      const targetPeer = peers.getOrCreatePeer(webRtcCannotInitiateIdentity())
      expect(targetPeer.state.type).toEqual('DISCONNECTED')

      // Link the peers
      peers.peerCandidates.addFromPeerList(targetPeer.getIdentityOrThrow(), {
        wsAddress: null,
        identity: brokeringPeer.getIdentityOrThrow(),
      })
      peers.peerCandidates.addFromPeerList(brokeringPeer.getIdentityOrThrow(), {
        wsAddress: null,
        identity: targetPeer.getIdentityOrThrow(),
      })

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
      expect(brokerPeerSendMock).toHaveBeenCalledWith(
        new SignalRequestMessage({
          sourceIdentity: peers.localPeer.publicIdentity,
          destinationIdentity: targetPeer.getIdentityOrThrow(),
        }),
      )
    })

    it('Does not create a connection if Peer has disconnectUntil set', () => {
      const pm = new PeerManager(mockLocalPeer(), mockPeerStore())
      const { peer } = getConnectedPeer(pm, 'peer')
      peer.close()

      // Mock the logger
      pm['logger'].mockTypes(() => jest.fn())

      // Verify that we could otherwise create a connection
      pm.connectToWebSocket(peer)
      expect(peer.state.type).toBe('CONNECTING')
      peer.close()

      // Set disconnectUntil and verify that we can't create a connection
      Assert.isNotNull(peer.state.identity)
      pm.peerCandidates.addFromPeer(peer)
      const candidate = pm.peerCandidates.get(peer.getIdentityOrThrow())
      Assert.isNotUndefined(candidate)
      candidate.peerRequestedDisconnectUntil = Number.MAX_SAFE_INTEGER

      pm.connectToWebSocket(peer)
      expect(peer.state.type).toBe('DISCONNECTED')
    })

    it('Sets disconnectUntil to null if current time is after disconnectUntil', () => {
      const pm = new PeerManager(mockLocalPeer(), mockPeerStore())
      const { peer } = getConnectedPeer(pm, 'peer')
      peer.close()

      pm.peerCandidates.addFromPeer(peer)
      const candidate = pm.peerCandidates.get(peer.getIdentityOrThrow())
      Assert.isNotUndefined(candidate)

      candidate.peerRequestedDisconnectUntil = 1
      pm.connectToWebSocket(peer)
      expect(peer.state.type).toBe('CONNECTING')
      expect(candidate.peerRequestedDisconnectUntil).toBeNull()

      candidate.peerRequestedDisconnectUntil = 1
      pm.connectToWebRTC(peer)
      expect(peer.state.type).toBe('CONNECTING')
      expect(candidate.peerRequestedDisconnectUntil).toBeNull()
    })

    it('Does not create a connection to a disconnected Peer above targetPeers', () => {
      const pm = new PeerManager(mockLocalPeer(), mockPeerStore(), undefined, undefined, 50, 1)

      // Add one connected peer
      getConnectedPeer(pm, 'peer1')

      // Add a second peer that's disconnected
      const peer2Identity = mockIdentity('peer2')
      const peer2 = pm.getOrCreatePeer(peer2Identity)
      peer2.wsAddress = { host: 'testuri.com', port: 9033 }

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
      const pm = new PeerManager(mockLocalPeer(), mockPeerStore())

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
      const pm = new PeerManager(mockLocalPeer(), mockPeerStore())

      const { peer, connection } = getSignalingWebRtcPeer(pm, brokerIdentity, peerIdentity)

      if (peer.state.type === 'DISCONNECTED') {
        throw new Error('Peer should not be DISCONNECTED')
      }
      if (!peer.state.connections.webRtc) {
        throw new Error('Peer should have a WebRTC connection')
      }

      jest.spyOn(connection, '_send').mockReturnValue(true)
      peer.state.connections.webRtc.setState({
        type: 'CONNECTED',
        identity: peerIdentity,
      })

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
          webRtc: peer.state.connections.webRtc,
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
        mockPeerStore(),
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
    const pm = new PeerManager(mockLocalPeer(), mockPeerStore())
    const onConnectedPeersChangedMock = jest.fn<() => void>()
    pm.onConnectedPeersChanged.on(onConnectedPeersChangedMock)

    const { peer: connecting } = getConnectingPeer(pm)
    const { peer: waiting } = getWaitingForIdentityPeer(pm)
    const { peer: connected } = getConnectedPeer(pm, 'peer')

    expect(onConnectedPeersChangedMock).toHaveBeenCalledTimes(1)

    // Disconnect all of the peers
    connecting.close()
    waiting.close()
    connected.close()

    expect(onConnectedPeersChangedMock).toHaveBeenCalledTimes(2)
  })

  describe('Message: Identity', () => {
    it('Adds the peer to identifiedPeers after receiving a valid identity message', () => {
      const other = mockIdentity('other')
      const pm = new PeerManager(mockLocalPeer(), mockPeerStore())

      expect(pm.identifiedPeers.size).toBe(0)
      expect(pm.peers.length).toBe(0)

      const { peer, connection } = getWaitingForIdentityPeer(pm)

      const identify = new IdentifyMessage({
        agent: '',
        head: Buffer.alloc(32, 0),
        identity: other,
        port: peer.port,
        sequence: 1,
        version: VERSION_PROTOCOL,
        work: BigInt(0),
        networkId: localPeer.networkId,
        genesisBlockHash: localPeer.chain.genesis.hash,
        features: defaultFeatures(),
      })
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
      const pm = new PeerManager(mockLocalPeer(), mockPeerStore())

      const { peer, connection } = getWaitingForIdentityPeer(pm)

      expect(pm.peers.length).toBe(1)
      const closeSpy = jest.spyOn(connection, 'close')

      const identify = new IdentifyMessage({
        agent: '',
        head: Buffer.alloc(32, 0),
        identity: privateIdentityToIdentity(other),
        port: peer.port,
        sequence: 1,
        version: VERSION_PROTOCOL_MIN - 1,
        work: BigInt(0),
        networkId: localPeer.networkId,
        genesisBlockHash: localPeer.chain.genesis.hash,
        features: defaultFeatures(),
      })
      peer.onMessage.emit(identify, connection)

      expect(closeSpy).toHaveBeenCalled()
      expect(pm.peers.length).toBe(0)
      expect(pm.identifiedPeers.size).toBe(0)
    })

    it('Closes the connection when an identity message with an invalid public key is sent', () => {
      const pm = new PeerManager(mockLocalPeer(), mockPeerStore())

      const { peer, connection } = getWaitingForIdentityPeer(pm)

      expect(pm.peers.length).toBe(1)
      const closeSpy = jest.spyOn(connection, 'close')

      const identify = new IdentifyMessage({
        agent: '',
        head: Buffer.alloc(32, 0),
        identity: 'test',
        port: peer.port,
        sequence: 1,
        version: VERSION_PROTOCOL,
        work: BigInt(0),
        networkId: localPeer.networkId,
        genesisBlockHash: localPeer.chain.genesis.hash,
        features: defaultFeatures(),
      })
      peer.onMessage.emit(identify, connection)
      expect(closeSpy).toHaveBeenCalled()
      expect(pm.peers.length).toBe(0)
      expect(pm.identifiedPeers.size).toBe(0)
    })

    it('Closes the connection if an unidentified peer returns the local identity', () => {
      const localIdentity = mockPrivateIdentity('local')
      const pm = new PeerManager(mockLocalPeer({ identity: localIdentity }), mockPeerStore())

      expect(pm.identifiedPeers.size).toBe(0)
      expect(pm.peers.length).toBe(0)

      const { connection } = getWaitingForIdentityPeer(pm)

      const identify = new IdentifyMessage({
        agent: '',
        head: Buffer.alloc(32, 0),
        identity: privateIdentityToIdentity(localIdentity),
        port: 9033,
        sequence: 1,
        version: VERSION_PROTOCOL,
        work: BigInt(0),
        networkId: localPeer.networkId,
        genesisBlockHash: localPeer.chain.genesis.hash,
        features: defaultFeatures(),
      })
      connection.onMessage.emit(identify)

      expect(connection.state).toEqual({
        type: 'DISCONNECTED',
      })

      expect(pm.peers.length).toBe(0)
      expect(pm.identifiedPeers.size).toBe(0)
    })

    it('Closes the connection if an identified peer returns the local identity', () => {
      const localIdentity = mockPrivateIdentity('local')
      const peerIdentity = mockIdentity('peer1')
      const pm = new PeerManager(mockLocalPeer({ identity: localIdentity }), mockPeerStore())

      const { peer: peer1, connection } = getWaitingForIdentityPeer(
        pm,
        ConnectionDirection.Inbound,
        peerIdentity,
      )

      expect(peer1.state.identity).toBe(peer1.getIdentityOrThrow())

      const identify = new IdentifyMessage({
        agent: '',
        head: Buffer.alloc(32, 0),
        identity: privateIdentityToIdentity(localIdentity),
        port: 9033,
        sequence: 1,
        version: VERSION_PROTOCOL,
        work: BigInt(0),
        networkId: localPeer.networkId,
        genesisBlockHash: localPeer.chain.genesis.hash,
        features: defaultFeatures(),
      })
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

      // The peer should be disposed, since there's no alternative way to connect to it
      expect(pm.identifiedPeers.size).toBe(0)
      expect(pm.peers.length).toBe(0)
    })

    it('Moves the connection to another peer if it returns a different identity', () => {
      const peer1Identity = mockIdentity('peer1')
      const peer2Identity = mockIdentity('peer2')
      const pm = new PeerManager(mockLocalPeer(), mockPeerStore())

      const { peer: peer1, connection } = getWaitingForIdentityPeer(
        pm,
        ConnectionDirection.Inbound,
        peer1Identity,
      )

      const identify = new IdentifyMessage({
        agent: '',
        head: Buffer.alloc(32, 0),
        identity: peer2Identity,
        port: peer1.port,
        sequence: 1,
        version: VERSION_PROTOCOL,
        work: BigInt(0),
        networkId: localPeer.networkId,
        genesisBlockHash: localPeer.chain.genesis.hash,
        features: defaultFeatures(),
      })
      connection.onMessage.emit(identify)

      expect(pm.identifiedPeers.size).toBe(1)
      expect(pm.peers.length).toBe(1)

      // Peer 1 should be disconnected and WS connection info removed
      expect(peer1.state).toEqual({
        type: 'DISCONNECTED',
        identity: peer1Identity,
      })
      expect(peer1.port).toBeNull()
      expect(peer1.address).toBeNull()

      const peer2 = pm.getPeer(peer2Identity)
      expect(peer2?.state).toEqual({
        type: 'CONNECTED',
        connections: { webSocket: connection },
        identity: peer2Identity,
      })
    })

    it('Closes the connection if the peer has disconnectUntil set', () => {
      const localIdentity = mockPrivateIdentity('local')
      const peerIdentity = mockIdentity('peer')
      const pm = new PeerManager(mockLocalPeer({ identity: localIdentity }), mockPeerStore())

      const { peer } = getConnectedPeer(pm, peerIdentity)
      peer.close()
      expect(peer.state).toEqual({ type: 'DISCONNECTED', identity: peerIdentity })

      pm.peerCandidates.addFromPeer(peer)
      const candidate = pm.peerCandidates.get(peerIdentity)
      Assert.isNotUndefined(candidate)
      candidate.localRequestedDisconnectUntil = Number.MAX_SAFE_INTEGER

      const { connection } = getWaitingForIdentityPeer(pm)

      const sendSpy = jest.spyOn(connection, 'send')
      const id = new IdentifyMessage({
        agent: '',
        head: Buffer.alloc(32, 0),
        identity: peerIdentity,
        port: 9033,
        sequence: 1,
        version: VERSION_PROTOCOL,
        work: BigInt(0),
        networkId: localPeer.networkId,
        genesisBlockHash: localPeer.chain.genesis.hash,
        features: defaultFeatures(),
      })
      connection.onMessage.emit(id)

      const localRequestedDisconnectUntil =
        pm.peerCandidates.get(peerIdentity)?.localRequestedDisconnectUntil
      Assert.isNotUndefined(localRequestedDisconnectUntil)
      Assert.isNotNull(localRequestedDisconnectUntil)

      const response = new DisconnectingMessage({
        sourceIdentity: privateIdentityToIdentity(localIdentity),
        destinationIdentity: peerIdentity,
        reason: DisconnectingReason.Congested,
        disconnectUntil: localRequestedDisconnectUntil,
      })
      expect(sendSpy).toHaveBeenCalledWith(response)

      expect(connection.state).toEqual({
        type: 'DISCONNECTED',
      })
    })

    it('Closes the connection when network ids do not match', () => {
      const other = mockPrivateIdentity('other')
      const pm = new PeerManager(mockLocalPeer(), mockPeerStore())

      const { peer, connection } = getWaitingForIdentityPeer(pm)

      expect(pm.peers.length).toBe(1)
      const closeSpy = jest.spyOn(connection, 'close')

      const identify = new IdentifyMessage({
        agent: '',
        head: Buffer.alloc(32, 0),
        identity: privateIdentityToIdentity(other),
        port: peer.port,
        sequence: 1,
        version: VERSION_PROTOCOL_MIN,
        work: BigInt(0),
        networkId: localPeer.networkId + 1,
        genesisBlockHash: localPeer.chain.genesis.hash,
        features: defaultFeatures(),
      })
      peer.onMessage.emit(identify, connection)

      expect(closeSpy).toHaveBeenCalled()
      expect(pm.peers.length).toBe(0)
      expect(pm.identifiedPeers.size).toBe(0)
    })

    it('Closes the connection when genesis block hashes do not match', () => {
      const other = mockPrivateIdentity('other')
      const pm = new PeerManager(mockLocalPeer(), mockPeerStore())

      const { peer, connection } = getWaitingForIdentityPeer(pm)

      expect(pm.peers.length).toBe(1)
      const closeSpy = jest.spyOn(connection, 'close')

      const identify = new IdentifyMessage({
        agent: '',
        head: Buffer.alloc(32, 0),
        identity: privateIdentityToIdentity(other),
        port: peer.port,
        sequence: 1,
        version: VERSION_PROTOCOL_MIN,
        work: BigInt(0),
        networkId: localPeer.networkId,
        genesisBlockHash: Buffer.alloc(32, 1),
        features: defaultFeatures(),
      })
      Assert.isFalse(identify.genesisBlockHash.equals(localPeer.chain.genesis.hash))
      peer.onMessage.emit(identify, connection)

      expect(closeSpy).toHaveBeenCalled()
      expect(pm.peers.length).toBe(0)
      expect(pm.identifiedPeers.size).toBe(0)
    })
  })

  describe('Message: SignalRequest', () => {
    it('Forwards SignalRequest message intended for another peer', () => {
      const pm = new PeerManager(mockLocalPeer(), mockPeerStore())

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

      const signal = new SignalRequestMessage({
        sourceIdentity: sourcePeer.getIdentityOrThrow(),
        destinationIdentity: destinationPeer.getIdentityOrThrow(),
      })

      const sendSpy = jest.spyOn(destinationPeer, 'send')
      sourcePeer.onMessage.emit(signal, sourcePeerConnection)
      expect(sendSpy).toHaveBeenCalledWith(signal)
    })

    it('Drops SignalRequest message originating from an different peer than sourceIdentity', () => {
      const pm = new PeerManager(mockLocalPeer(), mockPeerStore())

      const { peer: peer1 } = getConnectedPeer(pm)
      const { peer: peer2 } = getConnectedPeer(pm)
      const { connection: peer3Connection, peer: peer3 } = getConnectedPeer(pm)

      const signal = new SignalRequestMessage({
        sourceIdentity: peer1.getIdentityOrThrow(),
        destinationIdentity: peer2.getIdentityOrThrow(),
      })

      const sendSpy1 = jest.spyOn(peer1, 'send')
      const sendSpy2 = jest.spyOn(peer2, 'send')

      peer3.onMessage.emit(signal, peer3Connection)
      expect(sendSpy1).not.toHaveBeenCalled()
      expect(sendSpy2).not.toHaveBeenCalled()
    })

    it('reject SignalRequest when source peer should initiate', () => {
      const pm = new PeerManager(
        mockLocalPeer({ identity: webRtcLocalIdentity() }),
        mockPeerStore(),
      )
      const initWebRtcConnectionMock =
        jest.fn<(peer: Peer, initiator: boolean) => WebRtcConnection>()
      pm['initWebRtcConnection'] = initWebRtcConnectionMock

      const { peer, connection } = getConnectedPeer(pm, webRtcCannotInitiateIdentity())

      expect(canInitiateWebRTC(peer.getIdentityOrThrow(), pm.localPeer.publicIdentity)).toBe(
        true,
      )

      // Emit the signaling message
      const message = new SignalRequestMessage({
        sourceIdentity: peer.getIdentityOrThrow(),
        destinationIdentity: pm.localPeer.publicIdentity,
      })

      peer.onMessage.emit(message, connection)
      expect(initWebRtcConnectionMock).toHaveBeenCalledTimes(0)
    })

    it('Initiates webRTC connection when request intended for local peer', () => {
      const pm = new PeerManager(
        mockLocalPeer({ identity: webRtcLocalIdentity() }),
        mockPeerStore(),
      )
      const initWebRtcConnectionMock =
        jest.fn<(peer: Peer, initiator: boolean) => WebRtcConnection>()
      pm['initWebRtcConnection'] = initWebRtcConnectionMock

      const { peer, connection } = getConnectedPeer(pm, webRtcCanInitiateIdentity())

      expect(canInitiateWebRTC(peer.getIdentityOrThrow(), pm.localPeer.publicIdentity)).toBe(
        false,
      )

      // Emit the signaling message
      const message = new SignalRequestMessage({
        sourceIdentity: peer.getIdentityOrThrow(),
        destinationIdentity: pm.localPeer.publicIdentity,
      })

      peer.onMessage.emit(message, connection)
      expect(initWebRtcConnectionMock).toHaveBeenCalledTimes(1)
      expect(initWebRtcConnectionMock).toHaveBeenCalledWith(peer, true)
      expect(pm['getBrokeringPeers'](peer)[0]).toEqual(peer)
    })

    it('Sends a disconnect message if we are at max peers', () => {
      const pm = new PeerManager(
        mockLocalPeer({ identity: webRtcLocalIdentity() }),
        mockPeerStore(),
        undefined,
        undefined,
        1,
      )

      const { connection: peer1Connection, peer: peer1 } = getConnectedPeer(pm, 'peer')

      const message = new SignalRequestMessage({
        sourceIdentity: webRtcCanInitiateIdentity(),
        destinationIdentity: pm.localPeer.publicIdentity,
      })

      const sendSpy = jest.spyOn(peer1, 'send')

      peer1.onMessage.emit(message, peer1Connection)

      const reply = new DisconnectingMessage({
        disconnectUntil: expect.any(Number) as unknown as number,
        reason: DisconnectingReason.Congested,
        sourceIdentity: pm.localPeer.publicIdentity,
        destinationIdentity: webRtcCanInitiateIdentity(),
      })

      expect(sendSpy).toHaveBeenCalledWith(reply)
    })

    it('Does not send a disconnect message if we are at max peers but we have an existing connection to the peer', () => {
      const pm = new PeerManager(
        mockLocalPeer({ identity: webRtcLocalIdentity() }),
        mockPeerStore(),
        undefined,
        undefined,
        2,
      )

      const { connection: peer1Connection, peer: peer1 } = getConnectedPeer(pm, 'peer')
      getConnectedPeer(pm, webRtcCanInitiateIdentity())

      const message = new SignalRequestMessage({
        sourceIdentity: webRtcCanInitiateIdentity(),
        destinationIdentity: pm.localPeer.publicIdentity,
      })

      const sendSpy = jest.spyOn(peer1, 'send')

      peer1.onMessage.emit(message, peer1Connection)

      expect(sendSpy).not.toHaveBeenCalled()
    })
  })

  describe('Message: Signal', () => {
    it('Forwards signaling messages intended for another peer', () => {
      const peer1Identity = mockIdentity('peer1')
      const peer2Identity = mockIdentity('peer2')
      const pm = new PeerManager(mockLocalPeer(), mockPeerStore())

      const { connection: peer1Connection, peer: peer1 } = getConnectedPeer(pm, peer1Identity)
      const { peer: peer2 } = getConnectedPeer(pm, peer2Identity)

      const signal = new SignalMessage({
        sourceIdentity: peer1Identity,
        destinationIdentity: peer2Identity,
        nonce: '',
        signal: '',
      })

      const sendSpy = jest.spyOn(peer2, 'send')
      peer1.onMessage.emit(signal, peer1Connection)
      expect(sendSpy).toHaveBeenCalledWith(signal)
    })

    it('Drops signaling messages originating from an different peer than sourceIdentity', () => {
      const peer1Identity = mockIdentity('peer1')
      const peer2Identity = mockIdentity('peer2')
      const peer3Identity = mockIdentity('peer3')
      const pm = new PeerManager(mockLocalPeer(), mockPeerStore())

      const { peer: peer1 } = getConnectedPeer(pm, peer1Identity)
      const { peer: peer2 } = getConnectedPeer(pm, peer2Identity)
      const { connection: peer3Connection, peer: peer3 } = getConnectedPeer(pm, peer3Identity)

      const signal = new SignalMessage({
        sourceIdentity: peer1Identity,
        destinationIdentity: peer2Identity,
        nonce: '',
        signal: '',
      })

      const sendSpy1 = jest.spyOn(peer1, 'send')
      const sendSpy2 = jest.spyOn(peer2, 'send')
      peer3.onMessage.emit(signal, peer3Connection)
      expect(sendSpy1).not.toHaveBeenCalled()
      expect(sendSpy2).not.toHaveBeenCalled()
    })

    it('Sends a disconnect message if we are at max peers', () => {
      const pm = new PeerManager(
        mockLocalPeer({ identity: webRtcLocalIdentity() }),
        mockPeerStore(),
        undefined,
        undefined,
        1,
      )

      const { connection: peer1Connection, peer: peer1 } = getConnectedPeer(pm, 'peer')

      const message = new SignalMessage({
        sourceIdentity: webRtcCannotInitiateIdentity(),
        destinationIdentity: pm.localPeer.publicIdentity,
        nonce: '',
        signal: '',
      })

      const sendSpy = jest.spyOn(peer1, 'send')

      peer1.onMessage.emit(message, peer1Connection)

      const reply = new DisconnectingMessage({
        disconnectUntil: expect.any(Number) as unknown as number,
        reason: DisconnectingReason.Congested,
        sourceIdentity: pm.localPeer.publicIdentity,
        destinationIdentity: webRtcCannotInitiateIdentity(),
      })

      expect(sendSpy).toHaveBeenCalledWith(reply)
    })

    it('Does not send a disconnect message if we are at max peers but we have an existing connection to the peer', () => {
      const pm = new PeerManager(
        mockLocalPeer({ identity: webRtcLocalIdentity() }),
        mockPeerStore(),
        undefined,
        undefined,
        2,
      )

      const { connection: peer1Connection, peer: peer1 } = getConnectedPeer(pm, 'peer')
      getConnectedPeer(pm, webRtcCannotInitiateIdentity())

      const message = new SignalMessage({
        sourceIdentity: webRtcCannotInitiateIdentity(),
        destinationIdentity: pm.localPeer.publicIdentity,
        nonce: '',
        signal: '',
      })

      const sendSpy = jest.spyOn(peer1, 'send')

      peer1.onMessage.emit(message, peer1Connection)

      expect(sendSpy).not.toHaveBeenCalled()
    })

    it('Decrypts signaling data intended for local peer', async () => {
      const brokeringPeerIdentity = mockPrivateIdentity('brokering')

      jest.spyOn(localPeer, 'unboxMessage').mockReturnValueOnce({
        message: JSON.stringify({
          type: 'candidate',
          candidate: {
            candidate: '',
            sdpMLineIndex: 0,
            sdpMid: '0',
          },
        }),
      })

      const pm = new PeerManager(localPeer, mockPeerStore())

      const { connection, brokeringConnection, brokeringPeer } = getSignalingWebRtcPeer(
        pm,
        privateIdentityToIdentity(brokeringPeerIdentity),
        webRtcCanInitiateIdentity(),
      )

      const signalSpy = jest.spyOn(connection, 'signal')

      // Emit the signaling message
      const signal = new SignalMessage({
        sourceIdentity: webRtcCanInitiateIdentity(),
        destinationIdentity: privateIdentityToIdentity(webRtcLocalIdentity()),
        nonce: 'boxMessageNonce',
        signal: 'boxMessageMessage',
      })
      await brokeringPeer.onMessage.emitAsync(signal, brokeringConnection)

      expect(signalSpy).toHaveBeenCalledTimes(1)
      expect(signalSpy).toHaveBeenCalledWith({
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

      jest.spyOn(localPeer, 'unboxMessage').mockReturnValueOnce({ message: null })

      const pm = new PeerManager(localPeer, mockPeerStore())
      const { connection, brokeringConnection, brokeringPeer } = getSignalingWebRtcPeer(
        pm,
        brokeringPeerIdentity,
        webRtcCanInitiateIdentity(),
      )

      const signalSpy = jest.spyOn(connection, 'signal')
      const closeSpy = jest.spyOn(connection, 'close')

      // Emit the signaling message
      const signal = new SignalMessage({
        sourceIdentity: webRtcCanInitiateIdentity(),
        destinationIdentity: privateIdentityToIdentity(webRtcLocalIdentity()),
        nonce: 'boxMessageNonce',
        signal: 'boxMessageMessage',
      })
      await brokeringPeer.onMessage.emitAsync(signal, brokeringConnection)

      expect(signalSpy).not.toHaveBeenCalled()
      expect(closeSpy).toHaveBeenCalled()
    })

    it('Disconnects if decoding signaling data fails', async () => {
      const brokeringPeerIdentity = mockIdentity('brokering')

      // Return something that's not JSON from the unboxMessage function
      jest.spyOn(localPeer, 'unboxMessage').mockReturnValueOnce({ message: 'test' })

      const pm = new PeerManager(localPeer, mockPeerStore())
      const { connection, brokeringConnection, brokeringPeer } = getSignalingWebRtcPeer(
        pm,
        brokeringPeerIdentity,
        webRtcCanInitiateIdentity(),
      )

      const signalSpy = jest.spyOn(connection, 'signal')
      const closeSpy = jest.spyOn(connection, 'close')

      // Emit the signaling message
      const signal = new SignalMessage({
        sourceIdentity: webRtcCanInitiateIdentity(),
        destinationIdentity: privateIdentityToIdentity(webRtcLocalIdentity()),
        nonce: 'boxMessageNonce',
        signal: 'boxMessageMessage',
      })
      await brokeringPeer.onMessage.emitAsync(signal, brokeringConnection)

      expect(signalSpy).not.toHaveBeenCalled()
      expect(closeSpy).toHaveBeenCalled()
    })
  })

  describe('Message: PeerListRequest', () => {
    it('Sends a peer list message in response', () => {
      const peerIdentity = mockIdentity('peer')

      const pm = new PeerManager(mockLocalPeer(), mockPeerStore())
      const { connection, peer } = getConnectedPeer(pm, peerIdentity)

      expect(pm.peers.length).toBe(1)
      expect(pm.identifiedPeers.size).toBe(1)

      const peerListRequest = new PeerListRequestMessage()
      const peerList = new PeerListMessage([
        {
          identity: Buffer.from(peer.getIdentityOrThrow(), 'base64'),
          address: peer.address,
          port: peer.port,
        },
      ])

      const sendSpy = jest.spyOn(peer, 'send')
      peer.onMessage.emit(peerListRequest, connection)
      expect(sendSpy).toHaveBeenCalledTimes(1)
      expect(sendSpy).toHaveBeenCalledWith(peerList)
    })
  })

  describe('Message: PeerList', () => {
    it('Does not add local identity to peer candidate map', () => {
      const localIdentity = mockPrivateIdentity('local')
      const peerIdentity = mockIdentity('peer')

      const pm = new PeerManager(mockLocalPeer({ identity: localIdentity }), mockPeerStore())

      const { connection, peer } = getConnectedPeer(pm, peerIdentity)

      const peerList = new PeerListMessage([
        {
          identity: Buffer.from(privateIdentityToIdentity(localIdentity), 'base64'),
          address: peer.address,
          port: peer.port,
        },
      ])
      peer.onMessage.emit(peerList, connection)
      expect(pm.peerCandidates.has(privateIdentityToIdentity(localIdentity))).toBe(false)
    })

    it('Links peers when adding a new known peer', () => {
      const peerIdentity = mockIdentity('peer')
      const newPeerIdentity = mockIdentity('new')

      const pm = new PeerManager(mockLocalPeer(), mockPeerStore())

      const { connection, peer } = getConnectedPeer(pm, peerIdentity)

      expect(pm.peers.length).toBe(1)
      expect(pm.identifiedPeers.size).toBe(1)

      const peerList = new PeerListMessage([
        {
          identity: Buffer.from(newPeerIdentity, 'base64'),
          address: peer.address,
          port: peer.port,
        },
      ])
      peer.onMessage.emit(peerList, connection)

      expect(pm.peers.length).toBe(1)
      expect(pm.identifiedPeers.size).toBe(1)
      expect(pm.identifiedPeers.get(peerIdentity)).toBe(peer)
      expect(pm.identifiedPeers.get(newPeerIdentity)).toBeUndefined()

      expect(pm.peerCandidates.get(newPeerIdentity)?.neighbors.size).toBe(1)
      expect(pm.peerCandidates.get(newPeerIdentity)?.neighbors.has(peerIdentity)).toBe(true)
    })
  })

  describe('Message: Disconnect', () => {
    it('Drops disconnect messages originating from an different peer than sourceIdentity', () => {
      const peer1Identity = mockIdentity('peer1')
      const peer2Identity = mockIdentity('peer2')
      const peer3Identity = mockIdentity('peer3')
      const pm = new PeerManager(mockLocalPeer(), mockPeerStore())

      const { peer: peer1 } = getConnectedPeer(pm, peer1Identity)
      const { peer: peer2 } = getConnectedPeer(pm, peer2Identity)
      const { connection: peer3Connection, peer: peer3 } = getConnectedPeer(pm, peer3Identity)

      const signal = new DisconnectingMessage({
        sourceIdentity: peer1Identity,
        destinationIdentity: peer2Identity,
        disconnectUntil: Number.MAX_SAFE_INTEGER,
        reason: DisconnectingReason.ShuttingDown,
      })

      const sendSpy1 = jest.spyOn(peer1, 'send')
      const sendSpy2 = jest.spyOn(peer2, 'send')
      peer3.onMessage.emit(signal, peer3Connection)
      expect(sendSpy1).not.toHaveBeenCalled()
      expect(sendSpy2).not.toHaveBeenCalled()
    })

    it('Should set peerRequestedDisconnectUntil on CONNECTED Peer when sender is not sourceIdentity', () => {
      const localPeer = mockLocalPeer({ identity: webRtcLocalIdentity() })
      const pm = new PeerManager(localPeer, mockPeerStore())

      const { peer, brokeringConnection, brokeringPeer } = getSignalingWebRtcPeer(
        pm,
        mockIdentity('brokering'),
        webRtcCanInitiateIdentity(),
      )

      const disconnectMessage = new DisconnectingMessage({
        sourceIdentity: webRtcCanInitiateIdentity(),
        destinationIdentity: localPeer.publicIdentity,
        disconnectUntil: Number.MAX_SAFE_INTEGER,
        reason: DisconnectingReason.ShuttingDown,
      })

      expect(peer.state.type).toEqual('CONNECTING')
      expect(brokeringPeer.state.type).toEqual('CONNECTED')

      brokeringConnection.onMessage.emit(disconnectMessage)

      expect(peer.state.type).toEqual('DISCONNECTED')
      expect(
        pm.peerCandidates.get(webRtcCanInitiateIdentity())?.peerRequestedDisconnectUntil,
      ).toEqual(Number.MAX_SAFE_INTEGER)
      expect(brokeringPeer.state.type).toEqual('CONNECTED')
    })

    it('Should set peerRequestedDisconnectUntil on CONNECTED Peer when sender is sourceIdentity', () => {
      const localPeer = mockLocalPeer()
      const pm = new PeerManager(localPeer, mockPeerStore())
      const peerIdentity = mockIdentity('peer')
      const { peer, connection } = getConnectedPeer(pm, peerIdentity)

      Assert.isNotNull(peer.state.identity)
      pm.peerCandidates.addFromPeer(peer)

      const disconnectMessage = new DisconnectingMessage({
        sourceIdentity: peerIdentity,
        destinationIdentity: localPeer.publicIdentity,
        disconnectUntil: Number.MAX_SAFE_INTEGER,
        reason: DisconnectingReason.ShuttingDown,
      })

      connection.onMessage.emit(disconnectMessage)

      const peerRequestedDisconnectUntil = pm.peerCandidates.get(
        peer.state.identity,
      )?.peerRequestedDisconnectUntil

      expect(peerRequestedDisconnectUntil).toBe(Number.MAX_SAFE_INTEGER)
      expect(peer.state.type).toEqual('DISCONNECTED')
    })
  })
})
