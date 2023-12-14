/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { formatWebSocketAddress } from '../../../network'
import { WebSocketConnection } from '../../../network/peers/connections'
import { mockIdentity } from '../../../network/testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'

jest.mock('ws')

describe('Route peer/addPeer', () => {
  const routeTest = createRouteTest()

  it('should add a peer with a correct address and port', async () => {
    const request = { host: 'testhost', port: 9037 }
    const identity = mockIdentity('peer')

    const req = await routeTest.client.request('peer/addPeer', request).waitForRoute()

    const matchingPeers = routeTest.peerNetwork.peerManager.peers.filter(
      (p) => formatWebSocketAddress(p.wsAddress) === 'ws://testhost:9037',
    )

    expect(matchingPeers.length).toBe(1)
    expect(routeTest.peerNetwork.peerManager.peerCandidates.has(identity)).toBe(false)

    const peer = matchingPeers[0]

    let connection: WebSocketConnection
    if (peer.state.type === 'CONNECTING' && peer.state.connections.webSocket) {
      connection = peer.state.connections.webSocket
    } else {
      throw new Error('Peer should be CONNECTING with a WS connection')
    }

    connection.setState({
      type: 'CONNECTED',
      identity,
    })

    const response = await req.waitForEnd()

    expect(response.content).toMatchObject({
      added: true,
    })
    expect(
      routeTest.peerNetwork.peerManager
        .getConnectedPeers()
        .filter((p) => p.state.identity === identity),
    ).toHaveLength(1)
    expect(routeTest.peerNetwork.peerManager.peerCandidates.has(identity)).toBe(true)
  })

  it('should return false if the peer closes without an error', async () => {
    const request = { host: 'testhost', port: 9037 }
    const identity = mockIdentity('peer')

    const req = await routeTest.client.request('peer/addPeer', request).waitForRoute()

    const matchingPeers = routeTest.peerNetwork.peerManager.peers.filter(
      (p) => formatWebSocketAddress(p.wsAddress) === 'ws://testhost:9037',
    )

    expect(matchingPeers.length).toBe(1)
    expect(routeTest.peerNetwork.peerManager.peerCandidates.has(identity)).toBe(false)

    const peer = matchingPeers[0]

    let connection: WebSocketConnection
    if (peer.state.type === 'CONNECTING' && peer.state.connections.webSocket) {
      connection = peer.state.connections.webSocket
    } else {
      throw new Error('Peer should be CONNECTING with a WS connection')
    }

    connection.close()

    const response = await req.waitForEnd()

    expect(response.content).toMatchObject({
      added: false,
      error: undefined,
    })
    expect(
      routeTest.peerNetwork.peerManager
        .getConnectedPeers()
        .filter((p) => p.state.identity === identity),
    ).toHaveLength(0)
    expect(routeTest.peerNetwork.peerManager.peerCandidates.has(identity)).toBe(false)
  })

  it('should return false if the peer closes with an error', async () => {
    const request = { host: 'testhost', port: 9037 }
    const identity = mockIdentity('peer')

    const req = await routeTest.client.request('peer/addPeer', request).waitForRoute()

    const matchingPeers = routeTest.peerNetwork.peerManager.peers.filter(
      (p) => formatWebSocketAddress(p.wsAddress) === 'ws://testhost:9037',
    )

    expect(matchingPeers.length).toBe(1)
    expect(routeTest.peerNetwork.peerManager.peerCandidates.has(identity)).toBe(false)

    const peer = matchingPeers[0]

    let connection: WebSocketConnection
    if (peer.state.type === 'CONNECTING' && peer.state.connections.webSocket) {
      connection = peer.state.connections.webSocket
    } else {
      throw new Error('Peer should be CONNECTING with a WS connection')
    }

    connection.close(new Error('foo'))

    const response = await req.waitForEnd()

    expect(response.content).toMatchObject({
      added: false,
      error: 'foo',
    })
    expect(
      routeTest.peerNetwork.peerManager
        .getConnectedPeers()
        .filter((p) => p.state.identity === identity),
    ).toHaveLength(0)
    expect(routeTest.peerNetwork.peerManager.peerCandidates.has(identity)).toBe(false)
  })
})
