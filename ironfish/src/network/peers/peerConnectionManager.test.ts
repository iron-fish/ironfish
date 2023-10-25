/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

jest.mock('ws')

import { Assert } from '../../assert'
import { createRootLogger } from '../../logger'
import {
  getConnectedPeer,
  mockIdentity,
  mockLocalPeer,
  mockPeerStore,
  webRtcCanInitiateIdentity,
  webRtcLocalIdentity,
} from '../testUtilities'
import {
  ConnectionDirection,
  ConnectionType,
  WebRtcConnection,
  WebSocketConnection,
} from './connections'
import { PeerConnectionManager } from './peerConnectionManager'
import { PeerManager } from './peerManager'

jest.useFakeTimers()

describe('connectToDisconnectedPeers', () => {
  it('Should not connect to disconnected peers without an address or peers', () => {
    const pm = new PeerManager(mockLocalPeer(), mockPeerStore())
    const peer = pm.getOrCreatePeer(null)
    const pcm = new PeerConnectionManager(pm, createRootLogger(), { maxPeers: 50 })
    pm['logger'].mockTypes(() => jest.fn())
    pcm.start()
    expect(peer.state).toEqual({
      type: 'DISCONNECTED',
      identity: null,
    })
  })

  it('Should connect to disconnected unidentified peers with an address', () => {
    const pm = new PeerManager(mockLocalPeer(), mockPeerStore())

    const peer = pm.getOrCreatePeer(null)
    peer.setWebSocketAddress('testuri.com', 9033)
    pm['tryDisposePeer'](peer)

    pm.peerCandidates.addFromPeer(peer)

    const pcm = new PeerConnectionManager(pm, createRootLogger(), { maxPeers: 50 })
    pcm.start()
    expect(pm.peers.length).toBe(1)
    expect(pm.peers[0].state).toEqual({
      type: 'CONNECTING',
      identity: peer.getWebSocketAddress(),
      connections: {
        webSocket: expect.any(WebSocketConnection),
      },
    })
  })

  it('Should connect to disconnected identified peers with an address over WS', () => {
    const pm = new PeerManager(mockLocalPeer(), mockPeerStore())

    const identity = mockIdentity('peer')
    const peer = pm.getOrCreatePeer(identity)
    peer.setWebSocketAddress('testuri.com', 9033)
    pm['tryDisposePeer'](peer)

    pm.peerCandidates.addFromPeer(peer)

    // We want to test websocket only
    const retry = pm.getConnectionRetry(
      identity,
      ConnectionType.WebRtc,
      ConnectionDirection.Outbound,
    )
    Assert.isNotNull(retry)
    retry.neverRetryConnecting()

    const pcm = new PeerConnectionManager(pm, createRootLogger(), { maxPeers: 50 })
    pcm.start()

    expect(pm.peers.length).toBe(1)
    expect(pm.peers[0].state).toEqual({
      type: 'CONNECTING',
      identity: identity,
      connections: { webSocket: expect.any(WebSocketConnection) },
    })
  })

  it('Should connect to webrtc and websockets', () => {
    const peers = new PeerManager(mockLocalPeer(), mockPeerStore())

    const identity = mockIdentity('peer')
    const createdPeer = peers.getOrCreatePeer(identity)
    createdPeer.setWebSocketAddress('testuri.com', 9033)
    peers['tryDisposePeer'](createdPeer)

    peers.peerCandidates.addFromPeer(createdPeer)

    const peerConnections = new PeerConnectionManager(peers, createRootLogger(), {
      maxPeers: 50,
    })
    peerConnections.start()

    // Check now that were connecting to websockets and webrtc failed
    expect(peers.peers.length).toBe(1)
    const peer = peers.peers[0]
    expect(peers.canConnectToWebRTC(peer)).toBe(false)
    expect(peers.canConnectToWebSocket(peer)).toBe(false)
    expect(peer.state).toEqual({
      type: 'CONNECTING',
      identity: identity,
      connections: { webSocket: expect.any(WebSocketConnection) },
    })
  })

  it('Should connect to known peers of connected peers', () => {
    const peerIdentity = webRtcCanInitiateIdentity()
    const pm = new PeerManager(
      mockLocalPeer({ identity: webRtcLocalIdentity() }),
      mockPeerStore(),
    )
    const { peer: brokeringPeer } = getConnectedPeer(pm, 'brokering')
    // Link the peers
    pm.peerCandidates.addFromPeerList(brokeringPeer.getIdentityOrThrow(), {
      address: null,
      port: null,
      identity: Buffer.from(peerIdentity, 'base64'),
    })
    pm.peerCandidates.addFromPeerList(peerIdentity, {
      address: null,
      port: null,
      identity: Buffer.from(brokeringPeer.getIdentityOrThrow(), 'base64'),
    })

    const pcm = new PeerConnectionManager(pm, createRootLogger(), { maxPeers: 50 })
    pcm.start()

    const peer = pm.getPeer(peerIdentity)
    Assert.isNotNull(peer)
    expect(peer.state).toEqual({
      type: 'CONNECTING',
      identity: peerIdentity,
      connections: { webRtc: expect.any(WebRtcConnection) },
    })
  })
})

describe('maintainOneConnectionPerPeer', () => {
  it('Should not close WS connection if the WebRTC connection is not in CONNECTED', () => {
    const pm = new PeerManager(
      mockLocalPeer({ identity: webRtcLocalIdentity() }),
      mockPeerStore(),
    )
    const peer = pm.connectToWebSocketAddress({
      host: 'testuri',
      port: 9033,
    })

    Assert.isNotUndefined(peer)

    const identity = webRtcCanInitiateIdentity()
    if (peer.state.type === 'DISCONNECTED') {
      throw new Error('Peer should not be DISCONNECTED')
    }
    if (!peer.state.connections.webSocket) {
      throw new Error('Peer should have a WebSocket connection')
    }
    peer.state.connections.webSocket?.setState({
      type: 'CONNECTED',
      identity: identity,
    })

    pm.connectToWebRTC(peer)

    if (!peer.state.connections.webRtc) {
      throw new Error('Peer should have a WebRTC connection')
    }
    peer.state.connections.webRtc.setState({
      type: 'SIGNALING',
    })

    expect(peer.state).toEqual({
      type: 'CONNECTED',
      identity,
      connections: {
        webRtc: expect.any(WebRtcConnection),
        webSocket: expect.any(WebSocketConnection),
      },
    })

    const pcm = new PeerConnectionManager(pm, createRootLogger(), { maxPeers: 50 })
    pcm.start()

    expect(peer.state).toEqual({
      type: 'CONNECTED',
      identity,
      connections: {
        webRtc: expect.any(WebRtcConnection),
        webSocket: expect.any(WebSocketConnection),
      },
    })
  })

  it('Should close WebSocket connection if a peer has WS and WebRTC connections', () => {
    const pm = new PeerManager(
      mockLocalPeer({ identity: webRtcLocalIdentity() }),
      mockPeerStore(),
    )
    const peer = pm.connectToWebSocketAddress({
      host: 'testuri',
      port: 9033,
    })

    Assert.isNotUndefined(peer)
    const identity = webRtcCanInitiateIdentity()
    if (peer.state.type === 'DISCONNECTED') {
      throw new Error('Peer should not be DISCONNECTED')
    }
    if (!peer.state.connections.webSocket) {
      throw new Error('Peer should have a WebSocket connection')
    }
    peer.state.connections.webSocket?.setState({
      type: 'CONNECTED',
      identity: identity,
    })

    pm.connectToWebRTC(peer)

    if (!peer.state.connections.webRtc) {
      throw new Error('Peer should have a WebRTC connection')
    }
    peer.state.connections.webRtc.setState({
      type: 'CONNECTED',
      identity: identity,
    })

    expect(peer.state).toEqual({
      type: 'CONNECTED',
      identity,
      connections: {
        webRtc: expect.any(WebRtcConnection),
        webSocket: expect.any(WebSocketConnection),
      },
    })

    const pcm = new PeerConnectionManager(pm, createRootLogger(), { maxPeers: 50 })
    pcm.start()

    expect(peer.state).toEqual({
      type: 'CONNECTED',
      identity,
      connections: {
        webRtc: expect.any(WebRtcConnection),
      },
    })
  })
})

describe('attemptToEstablishWebRtcConnectionsToWSPeers', () => {
  it('Should attempt to establish a WebRTC connection if we have a WebSocket connection', () => {
    const pm = new PeerManager(
      mockLocalPeer({ identity: webRtcLocalIdentity() }),
      mockPeerStore(),
    )
    const peer = pm.connectToWebSocketAddress({
      host: 'testuri',
      port: 9033,
    })

    Assert.isNotUndefined(peer)
    const identity = webRtcCanInitiateIdentity()
    if (peer.state.type === 'DISCONNECTED') {
      throw new Error('Peer should not be DISCONNECTED')
    }
    if (!peer.state.connections.webSocket) {
      throw new Error('Peer should have a WebSocket connection')
    }
    peer.state.connections.webSocket?.setState({
      type: 'CONNECTED',
      identity: identity,
    })

    expect(peer.state).toEqual({
      type: 'CONNECTED',
      identity,
      connections: {
        webSocket: expect.any(WebSocketConnection),
      },
    })

    const pcm = new PeerConnectionManager(pm, createRootLogger(), { maxPeers: 50 })
    pcm.start()

    expect(peer.state).toEqual({
      type: 'CONNECTED',
      identity,
      connections: {
        webRtc: expect.any(WebRtcConnection),
        webSocket: expect.any(WebSocketConnection),
      },
    })
  })
})
