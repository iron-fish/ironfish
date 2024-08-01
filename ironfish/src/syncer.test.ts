/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert } from './assert'
import { BAN_SCORE } from './network/peers/peer'
import { getConnectedPeer } from './network/testUtilities'
import { useMinerBlockFixture } from './testUtilities/fixtures'
import { createNodeTest } from './testUtilities/nodeTest'
import { ArrayUtils, BenchUtils, PromiseUtils } from './utils'

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
    const { chain, peerNetwork, syncer } = nodeTest
    Assert.isNotNull(chain.head)

    jest
      .spyOn(peerNetwork, 'getBlockHeaders')
      .mockReturnValueOnce(Promise.resolve({ headers: [chain.genesis], time: 0 }))
    const syncFromSpy = jest.spyOn(syncer, 'syncFrom')

    // No peers connected to find
    await syncer.findPeer(null)
    expect(syncFromSpy).not.toHaveBeenCalled()

    const { peer } = getConnectedPeer(peerNetwork.peerManager)
    peer.work = 0n

    // Peer does not have more work
    await syncer.findPeer(null)
    expect(syncFromSpy).not.toHaveBeenCalled()

    peer.work = chain.head.work + 1n
    peer.sequence = chain.head.sequence

    // Peer should have more work than us now
    await syncer.findPeer(null)
    expect(syncFromSpy).toHaveBeenCalledWith(peer)
  })

  it('should sync and then finish from peer', async () => {
    const { peerNetwork, syncer } = nodeTest

    const { peer } = getConnectedPeer(peerNetwork.peerManager)
    peer.work = 1n
    peer.sequence = 1
    peer.head = Buffer.from('')

    const syncFromSpy = jest.spyOn(syncer, 'syncFrom')

    const [promise, resolve] = PromiseUtils.split<void>()
    syncFromSpy.mockReturnValue(promise)
    syncer['startSync'](peer)

    expect(syncer.stopping).not.toBe(null)
    expect(syncer.state).toEqual('syncing')
    expect(syncer.loader).toBe(peer)

    resolve()
    await syncer.stopping

    expect(syncer.stopping).toBe(null)
    expect(syncer.state).toEqual('idle')
    expect(syncer.loader).toBe(null)
  })

  it('should select the fastest peer to sync from', async () => {
    const { chain, peerNetwork, syncer } = nodeTest

    const { peer: peer1 } = getConnectedPeer(peerNetwork.peerManager)
    peer1.work = chain.head.work + 1n
    peer1.sequence = 2
    peer1.head = Buffer.from('')

    const { peer: peer2 } = getConnectedPeer(peerNetwork.peerManager)
    peer2.work = chain.head.work + 1n
    peer2.sequence = 2
    peer2.head = Buffer.from('')

    jest
      .spyOn(peerNetwork, 'getBlockHeaders')
      .mockReturnValue(Promise.resolve({ headers: [chain.genesis], time: 0 }))
    jest.spyOn(ArrayUtils, 'shuffle').mockImplementationOnce(() => [peer1, peer2])
    jest.spyOn(BenchUtils, 'end').mockImplementationOnce(() => 500)
    jest.spyOn(BenchUtils, 'end').mockImplementationOnce(() => 200)

    syncer.state = 'measuring'
    await syncer.findPeer(null)

    expect(syncer.loader).toEqual(peer2)
  })

  it('should stop syncing on error', async () => {
    const { peerNetwork, syncer } = nodeTest

    const { peer } = getConnectedPeer(peerNetwork.peerManager)
    peer.work = 1n
    peer.sequence = 1
    peer.head = Buffer.from('')

    const syncFromSpy = jest.spyOn(syncer, 'syncFrom')

    const [promise, , reject] = PromiseUtils.split<void>()
    syncFromSpy.mockReturnValue(promise)
    syncer['startSync'](peer)

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

  it('should stop syncing when peer disconnects', () => {
    const { peerNetwork, syncer } = nodeTest

    const { peer } = getConnectedPeer(peerNetwork.peerManager)
    peer.work = 1n
    peer.sequence = 1
    peer.head = Buffer.from('')

    const syncFromSpy = jest.spyOn(syncer, 'syncFrom')

    const [promise, resolve] = PromiseUtils.split<void>()
    syncFromSpy.mockReturnValue(promise)
    syncer['startSync'](peer)

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

  it('should sync blocks', async () => {
    const { chain, peerNetwork, syncer } = nodeTest

    const genesis = await chain.getBlock(chain.genesis)
    Assert.isNotNull(genesis)

    syncer.blocksPerMessage = 1
    syncer.state = 'syncing'

    const { node: nodeA } = await nodeTest.createSetup()
    const blockA1 = await useMinerBlockFixture(nodeA.chain)
    await expect(nodeA.chain).toAddBlock(blockA1)
    const blockA2 = await useMinerBlockFixture(nodeA.chain)
    await expect(nodeA.chain).toAddBlock(blockA2)
    const blockA3 = await useMinerBlockFixture(nodeA.chain)
    await expect(nodeA.chain).toAddBlock(blockA3)
    const blockA4 = await useMinerBlockFixture(nodeA.chain)
    await expect(nodeA.chain).toAddBlock(blockA4)

    const { peer } = getConnectedPeer(peerNetwork.peerManager)
    peer.sequence = blockA4.header.sequence
    peer.head = blockA4.header.hash
    peer.work = 10n

    const getBlocksSpy = jest
      .spyOn(peerNetwork, 'getBlocks')
      .mockImplementationOnce(() =>
        Promise.resolve({
          blocks: [genesis, blockA1],
          time: 100,
          isMessageFull: true,
        }),
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          blocks: [blockA1, blockA2],
          time: 100,
          isMessageFull: true,
        }),
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          blocks: [blockA2, blockA3],
          time: 100,
          isMessageFull: true,
        }),
      )
      .mockImplementationOnce(() =>
        Promise.resolve({ blocks: [blockA3], time: 100, isMessageFull: false }),
      )

    syncer.loader = peer
    await syncer.syncBlocks(peer, genesis.header.hash, genesis.header.sequence)

    expect(getBlocksSpy).toHaveBeenCalledTimes(4)
    expect(getBlocksSpy).toHaveBeenNthCalledWith(1, peer, genesis.header.hash, 2)
    expect(getBlocksSpy).toHaveBeenNthCalledWith(2, peer, blockA1.header.hash, 2)
    expect(getBlocksSpy).toHaveBeenNthCalledWith(3, peer, blockA2.header.hash, 2)
    expect(getBlocksSpy).toHaveBeenNthCalledWith(4, peer, blockA3.header.hash, 2)
  })

  it('should ban peers that send empty responses', async () => {
    const { chain, peerNetwork, syncer } = nodeTest

    syncer.blocksPerMessage = 1

    const { peer } = getConnectedPeer(peerNetwork.peerManager)
    peer.sequence = 2
    peer.head = Buffer.alloc(32, 1)
    peer.work = 10n

    const getBlocksSpy = jest
      .spyOn(peerNetwork, 'getBlocks')
      .mockImplementation(() =>
        Promise.resolve({ blocks: [], time: 100, isMessageFull: false }),
      )
    const peerPunished = jest.spyOn(peer, 'punish')

    syncer.loader = peer
    syncer.state = 'syncing'

    await syncer.syncBlocks(peer, chain.genesis.hash, chain.genesis.sequence)

    expect(getBlocksSpy).toHaveBeenCalledTimes(1)
    expect(peerPunished).toHaveBeenCalledTimes(1)
    expect(peerPunished).toHaveBeenCalledWith(BAN_SCORE.MAX, expect.anything())
  })

  it('should switch states from syncing to measuring', async () => {
    const { peerNetwork, syncer } = nodeTest

    const { peer } = getConnectedPeer(peerNetwork.peerManager)
    peer.work = 1n
    peer.sequence = 1
    peer.head = Buffer.from('')

    const syncFromSpy = jest.spyOn(syncer, 'syncFrom')

    const [promise, resolve] = PromiseUtils.split<void>()
    syncFromSpy.mockReturnValue(promise)
    syncer['startSync'](peer)

    // Set the nextMeasureTime to be less than now, which is the trigger to
    // transition to measuring state
    syncer.nextMeasureTime = 0
    expect(syncer.nextMeasureTime).toBeLessThan(performance.now())

    expect(syncer.state).toEqual('syncing')
    expect(syncer.loader).toBe(peer)

    resolve()
    await syncer.eventLoop()

    expect(syncer.state).toEqual('measuring')
    expect(syncer.lastLoaderIdentity).toEqual(peer.state.identity)
  })

  it('should find a peer when in measuring state', async () => {
    const { syncer } = nodeTest

    const findPeerSpy = jest.spyOn(syncer, 'findPeer')

    syncer.lastLoaderIdentity = 'foobar'
    syncer.state = 'measuring'
    await syncer.eventLoop()

    expect(findPeerSpy).toHaveBeenCalledTimes(1)
    expect(findPeerSpy).toHaveBeenCalledWith('foobar')
  })

  it('getNextMeasurementDelta', () => {
    const { syncer } = nodeTest

    const twoMinutes = 2 * 60 * 1000
    const fourMinutes = twoMinutes * 2
    const eightMinutes = fourMinutes * 2
    const sixteenMinutes = eightMinutes * 2
    const thirtyTwoMinutes = sixteenMinutes * 2
    const sixtyMinutes = 60 * 60 * 1000

    syncer.numberOfMeasurements = 0
    expect(syncer['getNextMeasurementDelta']()).toEqual(twoMinutes)

    syncer.numberOfMeasurements = 1
    expect(syncer['getNextMeasurementDelta']()).toEqual(fourMinutes)

    syncer.numberOfMeasurements = 2
    expect(syncer['getNextMeasurementDelta']()).toEqual(eightMinutes)

    syncer.numberOfMeasurements = 3
    expect(syncer['getNextMeasurementDelta']()).toEqual(sixteenMinutes)

    syncer.numberOfMeasurements = 4
    expect(syncer['getNextMeasurementDelta']()).toEqual(thirtyTwoMinutes)

    syncer.numberOfMeasurements = 5
    expect(syncer['getNextMeasurementDelta']()).toEqual(sixtyMinutes)

    syncer.numberOfMeasurements = 6
    expect(syncer['getNextMeasurementDelta']()).toEqual(sixtyMinutes)

    syncer.numberOfMeasurements = 100
    expect(syncer['getNextMeasurementDelta']()).toEqual(sixtyMinutes)
  })
})
