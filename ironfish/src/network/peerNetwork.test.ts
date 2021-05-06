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
import { DisconnectingMessage, NodeMessageType } from './messages'
import { mockNode, mockStrategy, mockChain } from '../testUtilities/mocks'

jest.useFakeTimers()

it('Closes the PeerManager when close is called', () => {
  const peerNetwork = new PeerNetwork({
    identity: mockPrivateIdentity('local'),
    agent: 'sdk/1/cli',
    webSocket: ws,
    node: mockNode(),
    chain: mockChain(),
    strategy: mockStrategy(),
  })

  const stopSpy = jest.spyOn(peerNetwork.peerManager, 'stop')
  peerNetwork.stop()
  expect(stopSpy).toBeCalled()
})

it('Registers a handler', () => {
  const peerNetwork = new PeerNetwork({
    identity: mockPrivateIdentity('local'),
    agent: 'sdk/1/cli',
    webSocket: ws,
    node: mockNode(),
    chain: mockChain(),
    strategy: mockStrategy(),
  })

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
  const peerNetwork = new PeerNetwork({
    identity: mockPrivateIdentity('local'),
    agent: 'sdk/1/cli',
    webSocket: ws,
    node: mockNode(),
    chain: mockChain(),
    strategy: mockStrategy(),
  })

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
  const peerNetwork = new PeerNetwork({
    identity: mockPrivateIdentity('local'),
    agent: 'sdk/1/cli',
    webSocket: ws,
    node: mockNode(),
    chain: mockChain(),
    strategy: mockStrategy(),
    minPeers: 1,
  })

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

  const peerNetwork = new PeerNetwork({
    identity: mockPrivateIdentity('local'),
    agent: 'sdk/1/cli',
    webSocket: wsActual,
    node: mockNode(),
    chain: mockChain(),
    strategy: mockStrategy(),
    listen: true,
    port: 0,
    minPeers: 1,
    maxPeers: 0,
  })

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

describe('enableSyncing option', () => {
  it('Defaults enableSyncing to true', async () => {
    const verifyNewBlock = jest.fn(() => {
      throw new Error('')
    })

    const verifyNewTransaction = jest.fn(() => {
      throw new Error('')
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      ...mockChain(),
      verifier: {
        verifyNewBlock,
        verifyNewTransaction,
      },
    }

    const peerNetwork = new PeerNetwork({
      identity: mockPrivateIdentity('local'),
      agent: 'sdk/1/cli',
      webSocket: ws,
      node: mockNode(),
      chain: chain,
      strategy: mockStrategy(),
    })

    const { peer } = getConnectedPeer(peerNetwork.peerManager)

    const newBlockHandler = peerNetwork['gossipRouter']['handlers'].get(
      NodeMessageType.NewBlock,
    )
    Assert.isNotUndefined(newBlockHandler)

    expect(peerNetwork['node']['syncer'].addNewBlock).not.toHaveBeenCalled()

    await newBlockHandler({
      peerIdentity: peer.getIdentityOrThrow(),
      message: {
        type: NodeMessageType.NewBlock,
        nonce: 'nonce',
        payload: { block: Buffer.alloc(0) },
      },
    })

    expect(peerNetwork['node']['syncer'].addNewBlock).toHaveBeenCalled()

    // Spy on new transactions
    const verifyNewTransactionSpy = jest.spyOn(
      peerNetwork['chain']['verifier'],
      'verifyNewTransaction',
    )

    const newTransactionHandler = peerNetwork['gossipRouter']['handlers'].get(
      NodeMessageType.NewTransaction,
    )

    if (newTransactionHandler === undefined)
      throw new Error('Expected newTransactionHandler to be defined')

    await newTransactionHandler({
      peerIdentity: '',
      message: {
        type: NodeMessageType.NewTransaction,
        nonce: 'nonce',
        payload: {},
      },
    })

    expect(verifyNewTransactionSpy).toHaveBeenCalled()
  })

  it('Does not call verifier when enableSyncing is false', async () => {
    const verifyNewBlock = jest.fn(() => {
      throw new Error('')
    })

    const verifyNewTransaction = jest.fn(() => {
      throw new Error('')
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      ...mockChain(),
      verifier: {
        verifyNewBlock,
        verifyNewTransaction,
      },
    }

    const peerNetwork = new PeerNetwork({
      identity: mockPrivateIdentity('local'),
      agent: 'sdk/1/cli',
      webSocket: ws,
      node: mockNode(),
      chain: chain,
      strategy: mockStrategy(),
      enableSyncing: false,
    })

    // Spy on new blocks
    const blockSpy = jest.spyOn(peerNetwork['chain']['verifier'], 'verifyNewBlock')

    const newBlockHandler = peerNetwork['gossipRouter']['handlers'].get(
      NodeMessageType.NewBlock,
    )
    if (newBlockHandler === undefined) throw new Error('Expected newBlockHandler to be defined')

    await newBlockHandler({
      peerIdentity: '',
      message: {
        type: NodeMessageType.NewBlock,
        nonce: 'nonce',
        payload: {},
      },
    })

    expect(blockSpy).not.toHaveBeenCalled()

    // Spy on new transactions
    const transactionSpy = jest.spyOn(peerNetwork['chain']['verifier'], 'verifyNewTransaction')

    const newTransactionHandler = peerNetwork['gossipRouter']['handlers'].get(
      NodeMessageType.NewTransaction,
    )
    if (newTransactionHandler === undefined)
      throw new Error('Expected newTransactionHandler to be defined')

    await newTransactionHandler({
      peerIdentity: '',
      message: {
        type: NodeMessageType.NewTransaction,
        nonce: 'nonce',
        payload: {},
      },
    })

    expect(transactionSpy).not.toHaveBeenCalled()
  })
})
