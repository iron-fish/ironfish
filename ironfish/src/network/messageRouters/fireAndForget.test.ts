/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

jest.mock('ws')

import ws from 'ws'
import { mockChain, mockNode, mockStrategy } from '../../testUtilities/mocks'
import { PeerNetwork, RoutingStyle } from '../peerNetwork'
import { AddressManager } from '../peers/addressManager'
import { PeerManager } from '../peers/peerManager'
import {
  getConnectedPeer,
  mockHostsStore,
  mockLocalPeer,
  mockPrivateIdentity,
} from '../testUtilities'
import { FireAndForgetRouter, IncomingFireAndForgetGeneric } from './fireAndForget'

jest.useFakeTimers()

describe('FireAndForget Router', () => {
  it('sends a fire and forget message', () => {
    const peers = new PeerManager(mockLocalPeer(), mockHostsStore())
    const sendToMock = jest.spyOn(peers, 'sendTo')

    const router = new FireAndForgetRouter(peers)
    router.register('pass', jest.fn())

    const { peer } = getConnectedPeer(peers)
    const request = { type: 'test', payload: { test: 'payload' } }
    router.fireAndForget(peer, request)
    expect(sendToMock).toBeCalledWith(peer, request)
  })

  it('handles an incoming fire and forget message', async () => {
    const peers = new PeerManager(mockLocalPeer(), mockHostsStore())
    const router = new FireAndForgetRouter(peers)

    const handleMock = jest.fn((_message: IncomingFireAndForgetGeneric<'incoming'>) =>
      Promise.resolve(),
    )
    router.register('incoming', handleMock)

    const { peer } = getConnectedPeer(peers)
    await router.handle(peer, { type: 'incoming', payload: { test: 'payload' } })

    expect(handleMock).toHaveBeenCalledWith({
      peerIdentity: peer.getIdentityOrThrow(),
      message: { type: 'incoming', payload: { test: 'payload' } },
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
      'test',
      RoutingStyle.fireAndForget,
      jest.fn((p) => Promise.resolve(p)),
      () => {},
    )

    const { peer } = getConnectedPeer(network.peerManager)
    await network['handleMessage'](peer, {
      peerIdentity: peer.getIdentityOrThrow(),
      message: { type: 'test', payload: { test: 'payload' } },
    })

    expect(fireAndForgetMock).toBeCalled()
    await network.stop()
  })
})
