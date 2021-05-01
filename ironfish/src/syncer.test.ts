/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert } from './assert'
import { createNodeTest } from './testUtilities/nodeTest'
import { getConnectedPeer } from './network/testUtilities'
import { PromiseUtils } from './utils'

describe('Syncer', () => {
  const nodeTest = createNodeTest()

  it('should start and stop syncer', async () => {
    const { syncer } = nodeTest

    await syncer.start()
    expect(syncer.state).toBe('idle')

    await syncer.stop()
    expect(syncer.state).toBe('stopped')
  })

  it('should load from peer with more work', async () => {
    const { node, chain, peerNetwork, syncer } = nodeTest
    await node.seed()
    Assert.isNotNull(chain.head)

    const startSyncSpy = jest.spyOn(syncer, 'startSync').mockImplementation()

    // No peers connected to find
    syncer.findPeer()
    expect(startSyncSpy).not.toHaveBeenCalled()

    const { peer } = getConnectedPeer(peerNetwork.peerManager)
    peer.work = BigInt(0)

    // Peer does not have more work
    syncer.findPeer()
    expect(startSyncSpy).not.toHaveBeenCalled()

    peer.work = chain.head.work + BigInt(1)

    // Peer should have more work than us now
    syncer.findPeer()
    expect(startSyncSpy).toHaveBeenCalledWith(peer)
  })

  it('should sync and then finish from peer', async () => {
    const { node, peerNetwork, syncer } = nodeTest
    await node.seed()

    const { peer } = getConnectedPeer(peerNetwork.peerManager)
    peer.work = BigInt(1)
    peer.sequence = BigInt(1)
    peer.head = Buffer.from('')

    const startSyncSpy = jest.spyOn(syncer, 'syncFrom')

    const [promise, resolve] = PromiseUtils.split<void>()
    startSyncSpy.mockReturnValue(promise)
    syncer.startSync(peer)

    expect(syncer.stopping).not.toBe(null)
    expect(syncer.state).toEqual('syncing')
    expect(syncer.loader).toBe(peer)

    resolve()
    await syncer.stopping

    expect(syncer.stopping).toBe(null)
    expect(syncer.state).toEqual('idle')
    expect(syncer.loader).toBe(null)
  })

  it('should stop syncing on error', async () => {
    const { node, peerNetwork, syncer } = nodeTest
    await node.seed()

    const { peer } = getConnectedPeer(peerNetwork.peerManager)
    peer.work = BigInt(1)
    peer.sequence = BigInt(1)
    peer.head = Buffer.from('')

    const startSyncSpy = jest.spyOn(syncer, 'syncFrom')

    const [promise, , reject] = PromiseUtils.split<void>()
    startSyncSpy.mockResolvedValue(promise)
    syncer.startSync(peer)

    expect(syncer.stopping).not.toBe(null)
    expect(syncer.state).toEqual('syncing')
    expect(syncer.loader).toBe(peer)

    const error = new Error('test')
    reject(error)
    Assert.isNotNull(syncer.stopping)
    await syncer.stopping.catch(() => {})

    expect(syncer.stopping).toBe(null)
    expect(syncer.state).toEqual('idle')
    expect(syncer.loader).toBe(null)
    expect(peer.state.type).toEqual('DISCONNECTED')
    expect(peer.error).toBe(error)
  })

  it('should stop syncing when peer disconnects', async () => {
    const { node, peerNetwork, syncer } = nodeTest
    await node.seed()

    const { peer } = getConnectedPeer(peerNetwork.peerManager)
    peer.work = BigInt(1)
    peer.sequence = BigInt(1)
    peer.head = Buffer.from('')

    const startSyncSpy = jest.spyOn(syncer, 'syncFrom')

    const [promise, resolve] = PromiseUtils.split<void>()
    startSyncSpy.mockResolvedValue(promise)
    syncer.startSync(peer)

    expect(syncer.stopping).not.toBe(null)
    expect(syncer.state).toEqual('syncing')
    expect(syncer.loader).toBe(peer)

    // Immediately kills syncing
    peer.close()

    expect(syncer.stopping).toBe(null)
    expect(syncer.state).toEqual('idle')
    expect(syncer.loader).toBe(null)

    // Should do nothing
    resolve()

    expect(syncer.stopping).toBe(null)
    expect(syncer.state).toEqual('idle')
    expect(syncer.loader).toBe(null)
  })
})
