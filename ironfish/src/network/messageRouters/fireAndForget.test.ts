/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

jest.mock('ws')

import ws from 'ws'
import { mockChain, mockNode, mockStrategy } from '../../testUtilities/mocks'
import {
  IncomingPeerMessage,
  NetworkMessage,
  NetworkMessageType,
} from '../messages/networkMessage'
import { PeerListRequestMessage } from '../messages/peerListRequest'
import { PeerNetwork, RoutingStyle } from '../peerNetwork'
import { AddressManager } from '../peers/addressManager'
import { PeerManager } from '../peers/peerManager'
import {
  getConnectedPeer,
  mockHostsStore,
  mockLocalPeer,
  mockPrivateIdentity,
} from '../testUtilities'
import { FireAndForgetRouter } from './fireAndForget'

jest.useFakeTimers()

describe('FireAndForget Router', () => {
  it('sends a fire and forget message', () => {
    const peers = new PeerManager(mockLocalPeer(), mockHostsStore())
    const sendToMock = jest.spyOn(peers, 'sendTo')

    const router = new FireAndForgetRouter(peers)
    router.register(NetworkMessageType.PeerListRequest, jest.fn())

    const { peer } = getConnectedPeer(peers)
    const request = new PeerListRequestMessage()
    router.fireAndForget(peer, request)
    expect(sendToMock).toBeCalledWith(peer, request)
  })

  it('handles an incoming fire and forget message', () => {
    const peers = new PeerManager(mockLocalPeer(), mockHostsStore())
    const router = new FireAndForgetRouter(peers)

    const handleMock = jest.fn((_message: IncomingPeerMessage<NetworkMessage>) => undefined)
    router.register(NetworkMessageType.PeerListRequest, handleMock)

    const { peer } = getConnectedPeer(peers)
    router.handle(peer, new PeerListRequestMessage())

    expect(handleMock).toHaveBeenCalledWith({
      peerIdentity: peer.getIdentityOrThrow(),
      message: new PeerListRequestMessage(),
    })
  })

  it('routes a fire and forget message as fire and forget', async () => {
    const addressManager = new AddressManager(mockHostsStore())
    addressManager.hostsStore = mockHostsStore()
    const network = new PeerNetwork({
      identity: mockPrivateIdentity('local'),
      agent: 'sdk/1/cli',
      webSocket: ws,
      node: mockNode(),
      chain: mockChain(),
      strategy: mockStrategy(),
      hostsStore: mockHostsStore(),
    })

    const fireAndForgetMock = jest.fn(async () => {})
    network['fireAndForgetRouter'].handle = fireAndForgetMock

    network.registerHandler(
      NetworkMessageType.PeerListRequest,
      RoutingStyle.fireAndForget,
      (p) => p,
      () => {},
    )

    const { peer } = getConnectedPeer(network.peerManager)
    await network['handleMessage'](peer, {
      peerIdentity: peer.getIdentityOrThrow(),
      message: new PeerListRequestMessage(),
    })

    expect(fireAndForgetMock).toBeCalled()
    await network.stop()
  })
})
