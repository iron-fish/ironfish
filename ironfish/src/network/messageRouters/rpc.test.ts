/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

jest.mock('./rpcId')
import { mocked } from 'ts-jest/utils'
import { NetworkError } from '../peers/connections/errors'
import { PeerManager } from '../peers/peerManager'
import { getConnectedPeer, mockHostsStore, mockLocalPeer } from '../testUtilities'
import { CannotSatisfyRequestError, Direction, RequestTimeoutError, RpcRouter } from './rpc'
import { nextRpcId, rpcTimeoutMillis } from './rpcId'

describe('RPC Router', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.useFakeTimers()
  })

  beforeEach(() => {
    mocked(nextRpcId).mockReturnValue(91)
    mocked(rpcTimeoutMillis).mockReturnValue(10)
  })

  it('Registers an RPC Handler', () => {
    const peers = new PeerManager(mockLocalPeer(), mockHostsStore())
    const router = new RpcRouter(peers)
    const handler = jest.fn()
    router.register('test', handler)
    expect(router['handlers'].size).toBe(1)
    expect(router['handlers'].get('test')).toBe(handler)
  })

  it('should time out RPC requests', async () => {
    const peers = new PeerManager(mockLocalPeer(), mockHostsStore())
    const sendToMock = jest.spyOn(peers, 'sendTo')

    const { peer } = getConnectedPeer(peers)
    const peerCloseMock = jest.spyOn(peer, 'close')

    const router = new RpcRouter(peers)
    const handlerMock = jest.fn()
    router.register('test', handlerMock)
    expect(router['requests'].size).toBe(0)

    const promise = router.requestFrom(peer, {
      type: 'test',
      payload: { test: 'payload' },
    })

    expect(router['requests'].size).toBe(1)
    jest.runOnlyPendingTimers()

    expect(router['requests'].size).toBe(0)
    expect(sendToMock).toHaveBeenCalledTimes(1)
    expect(peerCloseMock).toHaveBeenCalled()
    await expect(promise).toRejectErrorInstance(RequestTimeoutError)
  })

  it('should reject requests when connection disconnects', async () => {
    const peers = new PeerManager(mockLocalPeer(), mockHostsStore())
    const sendToMock = jest.spyOn(peers, 'sendTo')

    const { peer, connection } = getConnectedPeer(peers)
    const peerCloseMock = jest.spyOn(peer, 'close')

    const router = new RpcRouter(peers)
    router.register('test', jest.fn())
    expect(router['requests'].size).toBe(0)

    const subscribers = connection.onStateChanged.subscribers

    const promise = router.requestFrom(peer, {
      type: 'test',
      payload: { test: 'payload' },
    })

    expect(router['requests'].size).toBe(1)
    expect(connection.onStateChanged.subscribers).toBeGreaterThan(subscribers)
    connection.close()

    expect(connection.onStateChanged.subscribers).toBeLessThanOrEqual(subscribers)
    expect(router['requests'].size).toBe(0)
    expect(sendToMock).toHaveBeenCalledTimes(1)
    expect(peerCloseMock).not.toHaveBeenCalled()
    await expect(promise).toRejectErrorInstance(NetworkError)
  })

  it('should increment and decrement pendingRPC', async () => {
    mocked(nextRpcId).mockReturnValue(91)

    const peers = new PeerManager(mockLocalPeer(), mockHostsStore())
    jest.spyOn(peers, 'sendTo')
    const { peer } = getConnectedPeer(peers, 'peer')

    const router = new RpcRouter(peers)
    router.register('test', jest.fn())

    void router.requestFrom(peer, {
      type: 'test',
      payload: { test: 'payload' },
    })
    expect(peer.pendingRPC).toBe(1)

    await router.handle(peer, {
      rpcId: 91,
      direction: Direction.response,
      type: 'test',
      payload: { response: 'payload' },
    })
    expect(peer.pendingRPC).toBe(0)
  })

  it('Handles a response as a resolved request promise', async () => {
    mocked(nextRpcId).mockReturnValue(91)
    mocked(rpcTimeoutMillis).mockReturnValue(1000)

    const peers = new PeerManager(mockLocalPeer(), mockHostsStore())

    const router = new RpcRouter(peers)
    router.register('test', jest.fn())

    const { peer: peer1 } = getConnectedPeer(peers)
    const { peer: peer2 } = getConnectedPeer(peers)

    const promise = router.requestFrom(peer1, {
      type: 'test',
      payload: { test: 'payload' },
    })

    const response = {
      rpcId: 91,
      direction: Direction.response,
      type: 'test',
      payload: { response: 'payload' },
    }

    await router.handle(peer2, response)
    await expect(promise).resolves.toMatchObject({
      message: response,
    })

    expect(router['requests'].size).toBe(0)
  })

  it('Catches a cannotSatisfy error and returns the appropriate type', async () => {
    mocked(nextRpcId).mockReturnValue(18)

    const peers = new PeerManager(mockLocalPeer(), mockHostsStore())
    const sendToMock = jest.fn()
    peers.sendTo = sendToMock

    const handlerMock = jest.fn(() => {
      throw new CannotSatisfyRequestError('Bad request')
    })
    const router = new RpcRouter(peers)
    router.register('test', handlerMock)

    const { peer } = getConnectedPeer(peers)
    await router.handle(peer, {
      rpcId: 18,
      direction: Direction.request,
      type: 'test',
      payload: { test: 'payload' },
    })

    expect(router['requests'].size).toBe(0)
    expect(sendToMock).toBeCalledTimes(1)
    expect(sendToMock).toHaveBeenCalledWith(
      peer,
      expect.objectContaining({
        direction: Direction.response,
        type: 'cannotSatisfyRequest',
      }),
    )
  })
})
