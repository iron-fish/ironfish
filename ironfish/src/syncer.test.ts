/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert } from './assert'
import { BAN_SCORE } from './network/peers/peer'
import { getConnectedPeer } from './network/testUtilities'
import { makeBlockAfter } from './testUtilities/helpers/blockchain'
import { createNodeTest } from './testUtilities/nodeTest'
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

  it('should load from peer with more work', () => {
    const { chain, peerNetwork, syncer } = nodeTest
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
  }, 10000)

  it('should sync and then finish from peer', async () => {
    const { peerNetwork, syncer } = nodeTest

    const { peer } = getConnectedPeer(peerNetwork.peerManager)
    peer.work = BigInt(1)
    peer.sequence = 1
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
    const { peerNetwork, syncer } = nodeTest

    const { peer } = getConnectedPeer(peerNetwork.peerManager)
    peer.work = BigInt(1)
    peer.sequence = 1
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

  it('should stop syncing when peer disconnects', () => {
    const { peerNetwork, syncer } = nodeTest

    const { peer } = getConnectedPeer(peerNetwork.peerManager)
    peer.work = BigInt(1)
    peer.sequence = 1
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

  it('should sync blocks', async () => {
    const { strategy, chain, peerNetwork, syncer } = nodeTest

    const genesis = await chain.getBlock(chain.genesis)
    Assert.isNotNull(genesis)

    strategy.disableMiningReward()
    syncer.blocksPerMessage = 1

    const blockA1 = await makeBlockAfter(chain, genesis)
    const blockA2 = await makeBlockAfter(chain, blockA1)
    const blockA3 = await makeBlockAfter(chain, blockA2)
    const blockA4 = await makeBlockAfter(chain, blockA3)

    const { peer } = getConnectedPeer(peerNetwork.peerManager)
    peer.sequence = blockA4.header.sequence
    peer.head = blockA4.header.hash
    peer.work = BigInt(10)

    const getBlocksSpy = jest
      .spyOn(peerNetwork, 'getBlocks')
      .mockImplementationOnce(() =>
        Promise.resolve([
          strategy.blockSerde.serialize(genesis),
          strategy.blockSerde.serialize(blockA1),
        ]),
      )
      .mockImplementationOnce(() =>
        Promise.resolve([
          strategy.blockSerde.serialize(blockA1),
          strategy.blockSerde.serialize(blockA2),
        ]),
      )
      .mockImplementationOnce(() =>
        Promise.resolve([
          strategy.blockSerde.serialize(blockA2),
          strategy.blockSerde.serialize(blockA3),
        ]),
      )
      .mockImplementationOnce(() => Promise.resolve([strategy.blockSerde.serialize(blockA3)]))

    syncer.loader = peer
    await syncer.syncBlocks(peer, genesis.header.hash, genesis.header.sequence)

    expect(getBlocksSpy).toBeCalledTimes(4)
    expect(getBlocksSpy).toHaveBeenNthCalledWith(1, peer, genesis.header.hash, 2)
    expect(getBlocksSpy).toHaveBeenNthCalledWith(2, peer, blockA1.header.hash, 2)
    expect(getBlocksSpy).toHaveBeenNthCalledWith(3, peer, blockA2.header.hash, 2)
    expect(getBlocksSpy).toHaveBeenNthCalledWith(4, peer, blockA3.header.hash, 2)
  })

  it('should ban peers that send empty responses', async () => {
    const { strategy, chain, peerNetwork, syncer } = nodeTest

    strategy.disableMiningReward()
    syncer.blocksPerMessage = 1

    const blockA1 = await makeBlockAfter(chain, chain.genesis)

    const { peer } = getConnectedPeer(peerNetwork.peerManager)
    peer.sequence = blockA1.header.sequence
    peer.head = blockA1.header.hash
    peer.work = BigInt(10)

    const getBlocksSpy = jest
      .spyOn(peerNetwork, 'getBlocks')
      .mockImplementation(() => Promise.resolve([]))
    const peerPunished = jest.spyOn(peer, 'punish')

    syncer.loader = peer

    await syncer.syncBlocks(peer, chain.genesis.hash, chain.genesis.sequence)

    expect(getBlocksSpy).toBeCalledTimes(1)
    expect(peerPunished).toBeCalledTimes(1)
    expect(peerPunished).toBeCalledWith(BAN_SCORE.MAX, expect.anything())
  })
})
