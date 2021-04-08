/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

jest.mock('ws')

import ws from 'ws'
import type WSWebSocket from 'ws'
import http from 'http'
import net from 'net'
import { PeerNetwork, RoutingStyle } from './peerNetwork'
import { getConnectedPeer, mockPrivateIdentity } from './testUtilities'
import { Assert } from '../assert'
import { DisconnectingMessage } from './messages'

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

it('rejects websocket connections when at max peers', () => {
  const wsActual = jest.requireActual<typeof WSWebSocket>('ws')

  const peerNetwork = new PeerNetwork(
    mockPrivateIdentity('local'),
    'sdk/1/cli',
    wsActual,
    undefined,
    {
      enableListen: true,
      port: 0,
      minPeersReady: 1,
      maxPeers: 0,
    },
  )

  const rejectSpy = jest
    .spyOn(peerNetwork.peerManager, 'shouldRejectDisconnectedPeers')
    .mockReturnValue(true)

  // Start the network so it creates the webSocketServer
  peerNetwork.start()
  const server = peerNetwork['webSocketServer']
  Assert.isNotUndefined(server, `server`)

  const socket = new net.Socket()
  const req = new http.IncomingMessage(socket)
  const conn = new ws('test')

  const sendSpy = jest.spyOn(conn, 'send').mockReturnValue(undefined)
  const closeSpy = jest.spyOn(conn, 'close').mockReturnValue(undefined)
  server.server.emit('connection', conn, req)
  peerNetwork.stop()

  expect(rejectSpy).toHaveBeenCalled()
  expect(sendSpy).toHaveBeenCalled()
  expect(closeSpy).toHaveBeenCalled()

  // Check that the disconnect message was serialized properly
  const args = sendSpy.mock.calls[0][0]
  expect(typeof args).toEqual('string')
  const message = JSON.parse(args) as DisconnectingMessage
  expect(message.type).toEqual('disconnecting')
})
