/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert } from '../../assert'
import { DEFAULT_MAX_PEERS } from '../../fileStores'
import { createRootLogger } from '../../logger'
import {
  getConnectedPeer,
  mockIdentity,
  mockLocalPeer,
  mockPeerStore,
  webRtcCanInitiateIdentity,
  webRtcLocalIdentity,
} from '../testUtilities'
import { formatWebSocketAddress } from '../utils'
import {
  ConnectionDirection,
  ConnectionType,
  WebRtcConnection,
  WebSocketConnection,
} from './connections'
import { PeerConnectionManager } from './peerConnectionManager'
import { PeerManager } from './peerManager'

/* eslint-disable @typescript-eslint/no-explicit-any */

jest.mock('ws')
jest.useFakeTimers()

describe('connectToDisconnectedPeers', () => {
  it('should not connect to disconnected peers without an address or peers', () => {
    const pm = new PeerManager(mockLocalPeer(), mockPeerStore())
    const peer = pm.getOrCreatePeer(null)
    const pcm = new PeerConnectionManager(pm, createRootLogger(), {
      maxPeers: DEFAULT_MAX_PEERS,
    })
    pm['logger'].mockTypes(() => jest.fn())
    pcm.start()
    expect(peer.state).toEqual({
      type: 'DISCONNECTED',
      identity: null,
    })
  })

  it('should connect to disconnected unidentified peers with an address', () => {
    const pm = new PeerManager(mockLocalPeer(), mockPeerStore())

    const peer = pm.getOrCreatePeer(null)
    peer.wsAddress = { host: 'testuri.com', port: 9033 }
    pm['tryDisposePeer'](peer)

    pm.peerCandidates.addFromPeer(peer)

    const pcm = new PeerConnectionManager(pm, createRootLogger(), {
      maxPeers: DEFAULT_MAX_PEERS,
    })
    pcm.start()
    expect(pm.peers.length).toBe(1)
    expect(pm.peers[0].state).toEqual({
      type: 'CONNECTING',
      identity: formatWebSocketAddress(peer.wsAddress),
      connections: {
        webSocket: expect.any(WebSocketConnection),
      },
    })
  })

  it('should connect to disconnected identified peers with an address over WS', () => {
    const pm = new PeerManager(mockLocalPeer(), mockPeerStore())

    const identity = mockIdentity('peer')
    const peer = pm.getOrCreatePeer(identity)
    peer.wsAddress = { host: 'testuri.com', port: 9033 }
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

    const pcm = new PeerConnectionManager(pm, createRootLogger(), {
      maxPeers: DEFAULT_MAX_PEERS,
    })
    pcm.start()

    expect(pm.peers.length).toBe(1)
    expect(pm.peers[0].state).toEqual({
      type: 'CONNECTING',
      identity: identity,
      connections: { webSocket: expect.any(WebSocketConnection) },
    })
  })

  it('should connect to webrtc and websockets', () => {
    const peers = new PeerManager(mockLocalPeer(), mockPeerStore())

    const identity = mockIdentity('peer')
    const createdPeer = peers.getOrCreatePeer(identity)
    createdPeer.wsAddress = { host: 'testuri.com', port: 9033 }
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

  it('should connect to known peers of connected peers', () => {
    const peerIdentity = webRtcCanInitiateIdentity()
    const pm = new PeerManager(
      mockLocalPeer({ identity: webRtcLocalIdentity() }),
      mockPeerStore(),
    )
    const { peer: brokeringPeer } = getConnectedPeer(pm, 'brokering')
    // Link the peers
    pm.peerCandidates.addFromPeerList(brokeringPeer.getIdentityOrThrow(), {
      wsAddress: null,
      identity: peerIdentity,
    })
    pm.peerCandidates.addFromPeerList(peerIdentity, {
      wsAddress: null,
      identity: brokeringPeer.getIdentityOrThrow(),
    })

    const pcm = new PeerConnectionManager(pm, createRootLogger(), {
      maxPeers: DEFAULT_MAX_PEERS,
    })
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
  it('should not close WS connection if the WebRTC connection is not in CONNECTED', () => {
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

    const pcm = new PeerConnectionManager(pm, createRootLogger(), {
      maxPeers: DEFAULT_MAX_PEERS,
    })
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

  it('should close WebSocket connection if a peer has WS and WebRTC connections', () => {
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

    const pcm = new PeerConnectionManager(pm, createRootLogger(), {
      maxPeers: DEFAULT_MAX_PEERS,
    })
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
  it('should attempt to establish a WebRTC connection if we have a WebSocket connection', () => {
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

    const pcm = new PeerConnectionManager(pm, createRootLogger(), {
      maxPeers: DEFAULT_MAX_PEERS,
    })
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

describe('attemptNewConnections', () => {
  it('should be called by the event loop', () => {
    const pm = new PeerManager(mockLocalPeer(), mockPeerStore())
    const pcm = new PeerConnectionManager(pm, createRootLogger(), {
      maxPeers: DEFAULT_MAX_PEERS,
    })
    const attemptNewConnectionsSpy = jest.spyOn(pcm as any, 'attemptNewConnections')

    expect(attemptNewConnectionsSpy).toHaveBeenCalledTimes(0)

    pcm['eventLoop']()

    expect(attemptNewConnectionsSpy).toHaveBeenCalledTimes(1)
  })

  it('should only run if we can create new connections', () => {
    const pm = new PeerManager(mockLocalPeer(), mockPeerStore())
    const pcm = new PeerConnectionManager(pm, createRootLogger(), {
      maxPeers: DEFAULT_MAX_PEERS,
    })
    jest
      .spyOn(pm, 'canCreateNewConnections')
      .mockImplementationOnce(() => false)
      .mockImplementationOnce(() => true)
    const shufflePeerCandidatesSpy = jest.spyOn(pm.peerCandidates, 'shufflePeerCandidates')

    expect(shufflePeerCandidatesSpy).toHaveBeenCalledTimes(0)

    pcm['attemptNewConnections']()

    expect(shufflePeerCandidatesSpy).toHaveBeenCalledTimes(0)

    pcm['attemptNewConnections']()

    expect(shufflePeerCandidatesSpy).toHaveBeenCalledTimes(1)
  })
})

describe('maintainMaxPeerCount', () => {
  it('should be called by the event loop', () => {
    const pm = new PeerManager(mockLocalPeer(), mockPeerStore())
    const pcm = new PeerConnectionManager(pm, createRootLogger(), {
      maxPeers: DEFAULT_MAX_PEERS,
    })
    const maintainMaxPeerCountSpy = jest.spyOn(pcm as any, 'maintainMaxPeerCount')

    expect(maintainMaxPeerCountSpy).toHaveBeenCalledTimes(0)

    pcm['eventLoop']()

    expect(maintainMaxPeerCountSpy).toHaveBeenCalledTimes(1)
  })

  it('should not disconnect the newest peers', () => {
    const maxPeers = 5

    const pm = new PeerManager(mockLocalPeer(), mockPeerStore())
    const pcm = new PeerConnectionManager(pm, createRootLogger(), { maxPeers })

    for (let i = 0; i < maxPeers; i++) {
      getConnectedPeer(pm)
    }

    // Add and disconnect many times to ensure we don't disconnect the latest
    // peer while accounting for randomness
    for (let i = 0; i < 100; i++) {
      const latestPeer = getConnectedPeer(pm)
      pcm['maintainMaxPeerCount']()
      expect(latestPeer.connection.state.type).toEqual('CONNECTED')
    }
  })

  it('should not disconnect white-listed peers', () => {
    const maxPeers = 5

    const pm = new PeerManager(mockLocalPeer(), mockPeerStore())
    const pcm = new PeerConnectionManager(pm, createRootLogger(), {
      maxPeers,
      keepOpenPeerSlot: true,
    })

    // Add 3 white-listed peers
    const whitelistPeer1 = getConnectedPeer(pm)
    whitelistPeer1.peer.isWhitelisted = true

    const whitelistPeer2 = getConnectedPeer(pm)
    whitelistPeer2.peer.isWhitelisted = true

    const whitelistPeer3 = getConnectedPeer(pm)
    whitelistPeer3.peer.isWhitelisted = true

    // Add non-white-listed peer
    getConnectedPeer(pm)

    // Execute this test many times to ensure the logic is sound despite
    // randomness being involved
    for (let i = 0; i < 100; i++) {
      // Add 5th peer who is not eligible to be disconnected this loop, but will
      // be the only eligible peer next loop
      getConnectedPeer(pm)

      pcm['maintainMaxPeerCount']()
    }

    expect(whitelistPeer1.connection.state.type).toEqual('CONNECTED')
    expect(whitelistPeer2.connection.state.type).toEqual('CONNECTED')
    expect(whitelistPeer3.connection.state.type).toEqual('CONNECTED')
  })

  describe('when keepOpenPeerSlot is false', () => {
    it('should only disconnect a peer if it is above maxPeers', () => {
      const maxPeers = 5

      const pm = new PeerManager(mockLocalPeer(), mockPeerStore())
      const pcm = new PeerConnectionManager(pm, createRootLogger(), { maxPeers })
      const disconnectSpy = jest.spyOn(pm, 'disconnect')

      expect(pcm.keepOpenPeerSlot).toEqual(false)

      for (let i = 0; i < maxPeers; i++) {
        getConnectedPeer(pm)
      }

      expect(disconnectSpy).toHaveBeenCalledTimes(0)

      pcm['maintainMaxPeerCount']()

      expect(disconnectSpy).toHaveBeenCalledTimes(0)

      getConnectedPeer(pm)

      pcm['maintainMaxPeerCount']()

      expect(disconnectSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('when keepOpenPeerSlot is true', () => {
    it('should only disconnect a peer if it is at maxPeers', () => {
      const maxPeers = 5

      const pm = new PeerManager(mockLocalPeer(), mockPeerStore())
      const pcm = new PeerConnectionManager(pm, createRootLogger(), {
        maxPeers,
        keepOpenPeerSlot: true,
      })
      const disconnectSpy = jest.spyOn(pm, 'disconnect')

      expect(pcm.keepOpenPeerSlot).toEqual(true)

      for (let i = 0; i < maxPeers - 1; i++) {
        getConnectedPeer(pm)
      }

      expect(disconnectSpy).toHaveBeenCalledTimes(0)

      pcm['maintainMaxPeerCount']()

      expect(disconnectSpy).toHaveBeenCalledTimes(0)

      getConnectedPeer(pm)

      pcm['maintainMaxPeerCount']()

      expect(disconnectSpy).toHaveBeenCalledTimes(1)
    })
  })
})
