/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

jest.mock('./rpcId')
jest.mock('ws')

import '../testUtilities'
import { mocked } from 'ts-jest/utils'
import { InternalMessageType, MessageType } from '../messages'
import { PeerManager } from '../peers/peerManager'
import { getConnectedPeer, mockHostsStore, mockLocalPeer } from '../testUtilities'
import { GlobalRpcRouter } from './globalRpc'
import { CannotSatisfyRequestError, Direction, RpcRouter } from './rpc'
import { nextRpcId } from './rpcId'

jest.useFakeTimers()

describe('select peers', () => {
  // Apologies for the confusing and fragile random manipulations
  afterEach(() => {
    jest.spyOn(global.Math, 'random').mockRestore()
  })

  it('Returns null when no peers available', () => {
    const router = new GlobalRpcRouter(
      new RpcRouter(new PeerManager(mockLocalPeer(), mockHostsStore())),
    )

    router.register('take', jest.fn())
    expect(router['selectPeer']('take')).toBe(null)
  })

  it('Selects the peer if there is only one', () => {
    const router = new GlobalRpcRouter(
      new RpcRouter(new PeerManager(mockLocalPeer(), mockHostsStore())),
    )

    const pm = router.rpcRouter.peerManager
    const { peer } = getConnectedPeer(pm)

    router.register('take', jest.fn())
    expect(router['selectPeer']('take')).toBe(peer)
  })

  it('Selects peer2 if peer1 is saturated`', () => {
    const router = new GlobalRpcRouter(
      new RpcRouter(new PeerManager(mockLocalPeer(), mockHostsStore())),
    )
    router.register('take', jest.fn())
    const pm = router.rpcRouter.peerManager
    const { peer: peer1 } = getConnectedPeer(pm)
    const { peer: peer2 } = getConnectedPeer(pm)

    peer1.pendingRPC = peer1.pendingRPCMax
    expect(peer1.isSaturated).toBe(true)
    expect(peer2.isSaturated).toBe(false)

    router.register('take', jest.fn())
    expect(router['selectPeer']('take')).toBe(peer2)
  })

  it('Selects peer2 if peer1 failed', () => {
    const router = new GlobalRpcRouter(
      new RpcRouter(new PeerManager(mockLocalPeer(), mockHostsStore())),
    )

    const pm = router.rpcRouter.peerManager
    const { peer: peer1 } = getConnectedPeer(pm)
    const { peer: peer2 } = getConnectedPeer(pm)

    peer1.pendingRPC = 0
    peer2.pendingRPC = 1

    router.requestFails.set(peer1.getIdentityOrThrow(), new Set<MessageType>(['take']))

    router.register('take', jest.fn())
    expect(router['selectPeer']('take')).toBe(peer2)

    router.requestFails.delete(peer1.getIdentityOrThrow())
    expect(router['selectPeer']('take')).toBe(peer1)
  })

  it('Selects the peer1 if both failed', () => {
    const router = new GlobalRpcRouter(
      new RpcRouter(new PeerManager(mockLocalPeer(), mockHostsStore())),
    )

    const pm = router.rpcRouter.peerManager
    const { peer: peer1 } = getConnectedPeer(pm)
    const { peer: peer2 } = getConnectedPeer(pm)

    peer1.pendingRPC = 0
    peer2.pendingRPC = 1

    router.requestFails.set(peer1.getIdentityOrThrow(), new Set<MessageType>(['take']))
    router.requestFails.set(peer2.getIdentityOrThrow(), new Set<MessageType>(['take']))

    expect(router.requestFails.get(peer1.getIdentityOrThrow())?.has('take')).toBe(true)
    expect(router.requestFails.get(peer2.getIdentityOrThrow())?.has('take')).toBe(true)

    router.register('take', jest.fn())
    expect(router['selectPeer']('take')).toBe(peer1)

    // Test the fail counts were reset
    expect(router.requestFails.get(peer1.getIdentityOrThrow())?.has('take')).toBe(false)
    expect(router.requestFails.get(peer2.getIdentityOrThrow())?.has('take')).toBe(false)
  })

  it('Clears requestFails when peers disconnect', () => {
    const router = new GlobalRpcRouter(
      new RpcRouter(new PeerManager(mockLocalPeer(), mockHostsStore())),
    )

    const pm = router.rpcRouter.peerManager
    const { peer } = getConnectedPeer(pm)

    router.register('take', jest.fn())
    router.requestFails.set(peer.getIdentityOrThrow(), new Set<MessageType>(['take']))

    expect(router.requestFails.has(peer.getIdentityOrThrow())).toBe(true)
    pm.onDisconnect.emit(peer)
    expect(router.requestFails.has(peer.getIdentityOrThrow())).toBe(false)
  })
})

describe('Global Rpc', () => {
  beforeEach(() => jest.restoreAllMocks())

  it('Constructs a global RPC Router correctly', () => {
    const router = new GlobalRpcRouter(
      new RpcRouter(new PeerManager(mockLocalPeer(), mockHostsStore())),
    )
    expect(router.requestFails.size).toBe(0)
  })

  it('Registers a global RPC Handler with the direct rpc router', async () => {
    const router = new GlobalRpcRouter(
      new RpcRouter(new PeerManager(mockLocalPeer(), mockHostsStore())),
    )
    const handler = jest.fn()
    router.register('test', handler)
    expect(router.rpcRouter['handlers'].size).toBe(1)
    const rpcHandler = router.rpcRouter['handlers'].get('test')
    expect(rpcHandler).toBeDefined()
    if (!rpcHandler) {
      throw new Error('rpcHandler should be defined')
    }
    await rpcHandler({
      peerIdentity: 'peer',
      message: {
        type: 'test',
        rpcId: 0,
        direction: Direction.request,
        payload: { test: 'payload' },
      },
    })
    expect(handler).toBeCalledTimes(1)
  })

  it('throws when there are no peers available', async () => {
    const router = new GlobalRpcRouter(
      new RpcRouter(new PeerManager(mockLocalPeer(), mockHostsStore())),
    )

    router.register('test', () => Promise.resolve(undefined))
    const promise = router.request({ type: 'test', payload: { test: 'payload' } })
    await expect(promise).toRejectErrorInstance(CannotSatisfyRequestError)
  })

  it('throws when peers available but none respond', async () => {
    mocked(nextRpcId).mockReturnValue(44)

    const router = new GlobalRpcRouter(
      new RpcRouter(new PeerManager(mockLocalPeer(), mockHostsStore())),
    )

    const pm = router.rpcRouter.peerManager
    getConnectedPeer(pm)
    getConnectedPeer(pm)

    const sendToMock = jest.spyOn(pm, 'sendTo')
    router.register('test', () => Promise.resolve(undefined))

    const promise = router.request({ type: 'test', payload: { test: 'payload' } })

    // Disconnect both peers with timeouts
    await new Promise((resolve) => setImmediate(resolve))
    jest.runOnlyPendingTimers()
    await new Promise((resolve) => setImmediate(resolve))
    jest.runOnlyPendingTimers()

    await expect(promise).toRejectErrorInstance(CannotSatisfyRequestError)
    expect(router.requestFails.size).toBe(0)
    expect(sendToMock).toBeCalledTimes(2)
  })

  it('handles a round trip successfully with one peer', async () => {
    const router = new GlobalRpcRouter(
      new RpcRouter(new PeerManager(mockLocalPeer(), mockHostsStore())),
    )

    const pm = router.rpcRouter.peerManager
    const sendToMock = jest.spyOn(pm, 'sendTo')
    const { peer } = getConnectedPeer(pm)

    const request = {
      rpcId: 16,
      type: 'test',
      payload: { test: 'payload' },
    }

    const response = {
      rpcId: 16,
      direction: Direction.response,
      type: 'test',
      payload: { response: 'payload' },
    }

    mocked(nextRpcId).mockReturnValueOnce(16)
    router.register('test', () => Promise.resolve(undefined))
    const promise = router.request(request)

    await router.handle(peer, response)
    expect(sendToMock).toBeCalledWith(peer, expect.objectContaining(request))
    await expect(promise).resolves.toMatchObject({ message: response })
  })

  it('retries if first attempt returns cannot fulfill request', async () => {
    const router = new GlobalRpcRouter(
      new RpcRouter(new PeerManager(mockLocalPeer(), mockHostsStore())),
    )

    const pm = router.rpcRouter.peerManager
    const sendToMock = jest.spyOn(pm, 'sendTo')

    const { peer: peer1 } = getConnectedPeer(pm)
    const { peer: peer2 } = getConnectedPeer(pm)

    router.register('test', () => Promise.resolve(undefined))
    mocked(nextRpcId).mockReturnValueOnce(34).mockReturnValueOnce(11)
    const promise = router.request({ type: 'test', payload: { test: 'payload' } })

    await router.handle(peer1, {
      rpcId: 34,
      direction: Direction.response,
      type: InternalMessageType.cannotSatisfyRequest,
      payload: {},
    })

    void router.handle(peer2, {
      rpcId: 11,
      direction: Direction.response,
      type: 'test',
      payload: { response: 'payload' },
    })

    await expect(promise).resolves.toMatchObject({
      peerIdentity: peer2.getIdentityOrThrow(),
      message: {
        rpcId: 11,
        direction: Direction.response,
        type: 'test',
        payload: { response: 'payload' },
      },
    })
    expect(sendToMock).toBeCalledTimes(2)
  })
})
