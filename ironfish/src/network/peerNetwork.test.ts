/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

jest.mock('ws')

import ws from 'ws'
import { PeerNetwork, RoutingStyle } from './peerNetwork'
import { getConnectedPeer, mockPrivateIdentity } from './testUtilities'

jest.useFakeTimers()

it('Closes the PeerManager when close is called', () => {
  const peerNetwork = new PeerNetwork(mockPrivateIdentity('local'), 'sdk/1/cli', ws)
  const stopSpy = jest.spyOn(peerNetwork.peerManager, 'stop')
  peerNetwork.stop()
  expect(stopSpy).toBeCalled()
})

it('Registers a handler', () => {
  const peerNetwork = new PeerNetwork(mockPrivateIdentity('local'), 'sdk/1/cli', ws)
  peerNetwork.registerHandler(
    'hello',
    RoutingStyle.gossip,
    (p) => Promise.resolve(p),
    () => {},
  )
  expect(peerNetwork['routingStyles']).toMatchSnapshot()
  peerNetwork.stop()
})

it('ignores a message if validation fails', async () => {
  const peerNetwork = new PeerNetwork(mockPrivateIdentity('local'), 'sdk/1/cli', ws)
  const handlerMock = jest.fn(() => {})
  peerNetwork.registerHandler(
    'hello',
    RoutingStyle.gossip,
    () => Promise.reject(new Error('invalid message')),
    handlerMock,
  )

  const { peer } = getConnectedPeer(peerNetwork.peerManager)
  const message = { type: 'hello', nonce: 'test_handler1', payload: { test: 'Payload' } }
  await peerNetwork['handleMessage'](peer, { peerIdentity: peer.getIdentityOrThrow(), message })
  expect(handlerMock).not.toBeCalled()
  peerNetwork.stop()
})

it('changes isReady when peers connect', () => {
  const peerNetwork = new PeerNetwork(
    mockPrivateIdentity('local'),
    'sdk/1/cli',
    ws,
    undefined,
    {
      minPeersReady: 1,
    },
  )

  expect(peerNetwork.isReady).toBe(false)

  const readyChanged = jest.fn()
  peerNetwork.onIsReadyChanged.on(readyChanged)

  peerNetwork.start()
  expect(peerNetwork.isReady).toBe(false)

  const { peer } = getConnectedPeer(peerNetwork.peerManager)
  expect(peerNetwork.isReady).toBe(true)

  peer.close()
  expect(peerNetwork.isReady).toBe(false)

  peerNetwork.stop()
  expect(peerNetwork.isReady).toBe(false)

  expect(readyChanged).toBeCalledTimes(2)
  expect(readyChanged).toHaveBeenNthCalledWith(1, true)
  expect(readyChanged).toHaveBeenNthCalledWith(2, false)
})
