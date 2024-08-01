/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Blockchain } from '../blockchain'
import { VerificationResultReason } from '../consensus'
import { Block } from '../primitives/block'
import {
  createNodeTest,
  useBlockWithTx,
  useBlockWithTxs,
  useMinerBlockFixture,
} from '../testUtilities'
import { GetBlocksRequest, GetBlocksResponse } from './messages/getBlocks'
import {
  GetBlockTransactionsRequest,
  GetBlockTransactionsResponse,
} from './messages/getBlockTransactions'
import { GetCompactBlockRequest, GetCompactBlockResponse } from './messages/getCompactBlock'
import { NewBlockHashesMessage } from './messages/newBlockHashes'
import { NewCompactBlockMessage } from './messages/newCompactBlock'
import { Peer } from './peers/peer'
import { getConnectedPeer, getConnectedPeersWithSpies, peerMessage } from './testUtilities'

jest.mock('ws')
jest.useFakeTimers()

const newHashMessageEvent = (peer: Peer, block: Block) =>
  peerMessage(
    peer,
    new NewBlockHashesMessage([{ hash: block.header.hash, sequence: block.header.sequence }]),
  )

async function createDisconnectedBlocks(
  chain: Blockchain,
  numBlocks: number,
): Promise<Block[]> {
  const addedBlocks: Block[] = []
  for (const _ of [...new Array(numBlocks)]) {
    const block = await useMinerBlockFixture(chain)
    await chain.addBlock(block)
    addedBlocks.push(block)
  }

  for (const _ of addedBlocks) {
    await chain.removeBlock(chain.head.hash)
  }

  return addedBlocks
}

describe('BlockFetcher', () => {
  const nodeTest = createNodeTest()

  it('only requests one block if multiple hashes are received', async () => {
    const { peerNetwork, chain } = nodeTest

    const peers = getConnectedPeersWithSpies(peerNetwork.peerManager, 5)

    const newBlock = await useMinerBlockFixture(chain)
    const hash = newBlock.header.hash

    for (const { peer } of peers) {
      await peerNetwork.peerManager.onMessage.emitAsync(...newHashMessageEvent(peer, newBlock))
    }

    jest.runOnlyPendingTimers()

    const sentPeers = peers.filter(({ sendSpy }) => sendSpy.mock.calls.length > 0)

    expect(sentPeers).toHaveLength(1)

    expect(sentPeers[0].sendSpy).toHaveBeenCalledWith(
      new GetCompactBlockRequest(hash, expect.any(Number) as unknown as number),
    )

    await peerNetwork.stop()
  })

  it('does not send a request for a block if received NewCompactBlockMessage from another peer within 500ms', async () => {
    const { peerNetwork, chain } = nodeTest

    const block = await useMinerBlockFixture(chain)

    // The hash is received from 5 peers
    const peers = getConnectedPeersWithSpies(peerNetwork.peerManager, 5)

    for (const { peer } of peers) {
      await peerNetwork.peerManager.onMessage.emitAsync(...newHashMessageEvent(peer, block))
    }

    await expect(chain.hasBlock(block.header.hash)).resolves.toBe(false)

    // Another peer sends a compact block
    const { peer } = getConnectedPeer(peerNetwork.peerManager)

    const message = peerMessage(peer, new NewCompactBlockMessage(block.toCompactBlock()))
    await peerNetwork.peerManager.onMessage.emitAsync(...message)

    await expect(chain.hasBlock(block.header.hash)).resolves.toBe(true)

    jest.runOnlyPendingTimers()

    const sentPeers = peers.filter(({ sendSpy }) => sendSpy.mock.calls.length > 0)

    expect(sentPeers).toHaveLength(0)

    await peerNetwork.stop()
  })

  it('adds compact block to the chain when no additional transactions are needed', async () => {
    const { peerNetwork, chain } = nodeTest

    const block = await useMinerBlockFixture(chain)

    // The hash is received from 5 peers
    const peers = getConnectedPeersWithSpies(peerNetwork.peerManager, 5)

    for (const { peer } of peers) {
      await peerNetwork.peerManager.onMessage.emitAsync(...newHashMessageEvent(peer, block))
    }

    // We wait 500ms and then send the request for a compact block to a random peer
    jest.runOnlyPendingTimers()

    const sentPeers = peers.filter(({ sendSpy }) => sendSpy.mock.calls.length > 0)
    expect(sentPeers).toHaveLength(1)

    // The peer we requested responds with a compact block
    const sentPeer = sentPeers[0].peer
    const sentMessage = sentPeers[0].sendSpy.mock.calls[0][0]
    expect(sentMessage).toBeInstanceOf(GetCompactBlockRequest)
    const rpcId = (sentMessage as GetCompactBlockRequest).rpcId
    const message = new GetCompactBlockResponse(block.toCompactBlock(), rpcId)

    await expect(chain.hasBlock(block.header.hash)).resolves.toBe(false)

    await peerNetwork.peerManager.onMessage.emitAsync(sentPeer, message)

    await expect(chain.hasBlock(block.header.hash)).resolves.toBe(true)

    // The timeout for the original request ends. This should not affect anything
    // since we've already received the response
    jest.runOnlyPendingTimers()

    const sentPeers2 = peers.filter(({ sendSpy }) => {
      return sendSpy.mock.calls.length > 0
    })
    expect(sentPeers2).toHaveLength(1)

    await peerNetwork.stop()
  })

  it('fills missing transactions from the mempool', async () => {
    const { peerNetwork, chain, node } = nodeTest

    // Another node creates a block with 5 transactions
    const { block, transactions } = await useBlockWithTxs(node, 5)

    // Block should be one ahead of our current chain
    expect(block.header.sequence - chain.head.sequence).toEqual(1)

    // We accept one of the transaction in our mempool
    node.memPool.acceptTransaction(transactions[2])

    // Create 5 connected peers
    const peers = getConnectedPeersWithSpies(peerNetwork.peerManager, 5)

    expect(await chain.hasBlock(block.header.hash)).toBe(false)

    // Get compact block from peer and fill missing tx from mempool
    await peerNetwork.peerManager.onMessage.emitAsync(
      ...peerMessage(peers[0].peer, new NewCompactBlockMessage(block.toCompactBlock())),
    )

    // We should have sent a transaction request to the peer who sent the compact block
    expect(peers[0].sendSpy.mock.calls).toHaveLength(1)
    const request = peers[0].sendSpy.mock.calls[0][0]
    expect(request).toEqual(
      new GetBlockTransactionsRequest(
        block.header.hash,
        [1, 0, 1, 0],
        expect.any(Number) as unknown as number,
      ),
    )

    expect(await chain.hasBlock(block.header.hash)).toBe(false)

    // The peer we requested responds with the transactions not in mempool
    const response = new GetBlockTransactionsResponse(
      block.header.hash,
      transactions.filter((t) => t !== transactions[2]),
      (request as GetBlockTransactionsRequest).rpcId,
    )

    await peerNetwork.peerManager.onMessage.emitAsync(...peerMessage(peers[0].peer, response))

    expect(await chain.hasBlock(block.header.hash)).toBe(true)

    // Block should be gossiped to peers who have not seen it
    for (const { sendSpy } of peers.slice(1)) {
      expect(sendSpy.mock.calls).toHaveLength(1)
    }

    await peerNetwork.stop()
  })

  it('fills missing transactions from transaction request if not in mempool', async () => {
    const { peerNetwork, chain, node } = nodeTest

    const { block, transactions } = await useBlockWithTxs(node, 5)

    // Block should be one ahead of our current chain
    expect(block.header.sequence - chain.head.sequence).toEqual(1)

    // Connect to 5 peers and send hash messages of the block
    const peers = getConnectedPeersWithSpies(peerNetwork.peerManager, 5)
    for (const { peer } of peers) {
      await peerNetwork.peerManager.onMessage.emitAsync(...newHashMessageEvent(peer, block))
    }

    // We wait 500ms and then send the request for the block to a random peer
    jest.runOnlyPendingTimers()

    const sentPeers = peers.filter(({ sendSpy }) => sendSpy.mock.calls.length > 0)
    expect(sentPeers).toHaveLength(1)

    // The peer we requested responds with the compact block
    const sentPeer = sentPeers[0].peer
    const sentMessage = sentPeers[0].sendSpy.mock.calls[0][0] as GetCompactBlockRequest
    expect(sentMessage).toBeInstanceOf(GetCompactBlockRequest)
    const compactBlockResponse = peerMessage(
      sentPeer,
      new GetCompactBlockResponse(block.toCompactBlock(), sentMessage.rpcId),
    )

    await peerNetwork.peerManager.onMessage.emitAsync(...compactBlockResponse)

    await expect(chain.hasBlock(block.header.hash)).resolves.toBe(false)

    // We should have sent a transaction request to the peer who sent the compact block
    const sentMessage2 = sentPeers[0].sendSpy.mock.calls[1][0]
    expect(sentMessage2).toBeInstanceOf(GetBlockTransactionsRequest)
    const getBlockTransactionsRequest = sentMessage2 as GetBlockTransactionsRequest
    expect(getBlockTransactionsRequest.blockHash).toEqual(block.header.hash)
    expect(getBlockTransactionsRequest.transactionIndexes).toEqual([1, 0, 0, 0, 0])

    // We should not have sent messages to any other peers
    const sentPeers2 = peers.filter(({ sendSpy }) => {
      return sendSpy.mock.calls.length > 0
    })
    expect(sentPeers2).toHaveLength(1)

    // The peer we requested responds with the transactions
    const response = new GetBlockTransactionsResponse(
      block.header.hash,
      transactions,
      getBlockTransactionsRequest.rpcId,
    )

    await peerNetwork.peerManager.onMessage.emitAsync(...peerMessage(sentPeer, response))

    // The block should now be in the chain
    await expect(chain.hasBlock(block.header.hash)).resolves.toBe(true)

    // Run timers to make sure we would not have sent messages to any other peers
    jest.runOnlyPendingTimers()

    const sentPeers3 = peers.filter(({ sendSpy }) => sendSpy.mock.calls.length > 0)
    expect(sentPeers3).toHaveLength(1)

    await peerNetwork.stop()
  })

  it('requests full block if transaction request fails', async () => {
    const { peerNetwork, chain, node } = nodeTest

    const { block } = await useBlockWithTx(node, undefined, undefined, true, undefined)

    // Block should be one ahead of our current chain
    expect(block.header.sequence - chain.head.sequence).toEqual(1)

    // Connect to 5 peers and send newBlock messages
    const peers = getConnectedPeersWithSpies(peerNetwork.peerManager, 5)
    for (const { peer } of peers) {
      await peerNetwork.peerManager.onMessage.emitAsync(
        ...peerMessage(peer, new NewCompactBlockMessage(block.toCompactBlock())),
      )
    }

    await expect(chain.hasBlock(block.header.hash)).resolves.toBe(false)

    // We should have sent a transaction request to one random peer
    const sentPeers = peers.filter(({ sendSpy }) => sendSpy.mock.calls.length > 0)
    expect(sentPeers).toHaveLength(1)
    const sentPeer = sentPeers[0].peer
    const sentMessage = sentPeers[0].sendSpy.mock.calls[0][0]
    expect(sentMessage).toBeInstanceOf(GetBlockTransactionsRequest)
    const getBlockTransactionsRequest = sentMessage as GetBlockTransactionsRequest
    expect(getBlockTransactionsRequest.blockHash).toEqual(block.header.hash)
    expect(getBlockTransactionsRequest.transactionIndexes).toEqual([1])

    // Run timers to time out the transaction request
    jest.runOnlyPendingTimers()

    // A full block request should be sent to a different peer
    const sentPeers3 = peers.filter(
      ({ sendSpy }) =>
        sendSpy.mock.calls.length > 0 && sendSpy.mock.calls[0][0] instanceof GetBlocksRequest,
    )
    expect(sentPeers3).toHaveLength(1)
    const { peer: otherSentPeer, sendSpy: otherSendSpy } = sentPeers3[0]
    expect(sentPeer).not.toBe(otherSentPeer)
    expect(otherSendSpy.mock.calls[0][0]).toBeInstanceOf(GetBlocksRequest)
    const getBlocksRequest = otherSendSpy.mock.calls[0][0] as GetBlocksRequest
    expect(getBlocksRequest.start).toEqual(block.header.hash)
    expect(getBlocksRequest.limit).toEqual(1)

    // The peer should respond with a GetBlocksResponse
    await peerNetwork.peerManager.onMessage.emitAsync(
      ...peerMessage(otherSentPeer, new GetBlocksResponse([block], getBlocksRequest.rpcId)),
    )

    await expect(chain.hasBlock(block.header.hash)).resolves.toBe(true)

    // Reset mocks and run timers to time out any other potential requests
    for (const { sendSpy } of peers) {
      sendSpy.mockClear()
    }

    jest.runOnlyPendingTimers()

    // No more messages should be sent
    const sentPeers4 = peers.filter(({ sendSpy }) => sendSpy.mock.calls.length > 0)
    expect(sentPeers4).toHaveLength(0)

    await peerNetwork.stop()
  })

  it('does not request compact block when node has block in blockchain', async () => {
    const { peerNetwork, chain } = nodeTest

    const block = await useMinerBlockFixture(chain)

    await expect(chain).toAddBlock(block)

    const { peer, sendSpy } = getConnectedPeersWithSpies(peerNetwork.peerManager, 1)[0]

    expect(peer.knownBlockHashes.has(block.header.hash)).toBe(false)

    await peerNetwork.peerManager.onMessage.emitAsync(...newHashMessageEvent(peer, block))

    jest.runOnlyPendingTimers()

    expect(sendSpy.mock.calls).toHaveLength(0)

    await peerNetwork.stop()
  })

  it('does not request compact block when block was previously marked as invalid', async () => {
    const { peerNetwork, chain } = nodeTest

    const block = await useMinerBlockFixture(chain)

    chain.addInvalid(block.header.hash, VerificationResultReason.ERROR)

    const { peer, sendSpy } = getConnectedPeersWithSpies(peerNetwork.peerManager, 1)[0]

    await peerNetwork.peerManager.onMessage.emitAsync(...newHashMessageEvent(peer, block))

    jest.runOnlyPendingTimers()

    expect(sendSpy.mock.calls).toHaveLength(0)

    await peerNetwork.stop()
  })

  it('ignores new messages when the block was previously marked as an orphan', async () => {
    const { peerNetwork, chain, node } = nodeTest

    // Create an orphan block by adding 5 blocks, removing 5 blocks then adding 5 new blocks
    // We want to have an orphan that is also not ahead of the current chain
    const addedBlocks = await createDisconnectedBlocks(chain, 5)

    const orphanBlock = addedBlocks[4]

    // Add 5 different blocks to the chain
    for (const _ of [...new Array(5)]) {
      const block = await useMinerBlockFixture(chain)
      await chain.addBlock(block)
    }

    const syncSpy = jest.spyOn(node.syncer, 'startSyncIfIdle')

    const peers = getConnectedPeersWithSpies(peerNetwork.peerManager, 4)

    // The first peer sends a orphaned compact block
    await peerNetwork.peerManager.onMessage.emitAsync(
      ...peerMessage(peers[0].peer, new NewCompactBlockMessage(orphanBlock.toCompactBlock())),
    )

    expect(chain.orphans.has(orphanBlock.header.hash)).toBe(true)
    expect(syncSpy).toHaveBeenCalledTimes(1)

    // The second peer sends a hash of the orphaned block
    await peerNetwork.peerManager.onMessage.emitAsync(
      ...newHashMessageEvent(peers[1].peer, orphanBlock),
    )

    // Advance timers in case of peer waiting to send out a request for the compact block
    jest.runOnlyPendingTimers()

    expect(peers[1].sendSpy).not.toHaveBeenCalled()
    expect(syncSpy).toHaveBeenCalledTimes(1)

    // The third peer sends the compact block as well, we should ignore it as an orphan
    await peerNetwork.peerManager.onMessage.emitAsync(
      ...peerMessage(peers[2].peer, new NewCompactBlockMessage(orphanBlock.toCompactBlock())),
    )

    expect(peers[2].sendSpy).not.toHaveBeenCalled()
    expect(syncSpy).toHaveBeenCalledTimes(1)

    await peerNetwork.stop()
  })

  it('accepts the block if it was previously marked as an orphan but is not anymore', async () => {
    const { peerNetwork, chain } = nodeTest

    // Create an orphan block by adding 5 blocks, removing 5 blocks then adding 5 new blocks
    // We want to have an orphan that is also not ahead of the current chain
    const addedBlocks = await createDisconnectedBlocks(chain, 5)

    const orphan = addedBlocks[4]

    // Add 5 different blocks to the chain
    for (const _ of [...new Array(5)]) {
      const block = await useMinerBlockFixture(chain)
      await chain.addBlock(block)
    }

    const peers = getConnectedPeersWithSpies(peerNetwork.peerManager, 4)

    // The first peer sends a orphaned compact block and it's added to orphans
    await peerNetwork.peerManager.onMessage.emitAsync(
      ...peerMessage(peers[0].peer, new NewCompactBlockMessage(orphan.toCompactBlock())),
    )

    expect(chain.orphans.has(orphan.header.hash)).toBe(true)

    // Remove the 5 blocks added and add back previous blocks to make the orphan no longer an orphan
    for (const _ of [...new Array(5)]) {
      await chain.removeBlock(chain.head.hash)
    }

    for (const block of addedBlocks.slice(0, 4)) {
      await chain.addBlock(block)
    }

    expect(chain.orphans.has(orphan.header.hash)).toBe(false)

    // A second peer sends the same block, but it should now be added to the chain
    await peerNetwork.peerManager.onMessage.emitAsync(
      ...peerMessage(peers[1].peer, new NewCompactBlockMessage(orphan.toCompactBlock())),
    )

    await expect(chain.hasBlock(orphan.header.hash)).resolves.toBe(true)

    await peerNetwork.stop()
  })

  it('correctly sends the first peer to send us a block to telemetry', async () => {
    const { peerNetwork, chain, node } = nodeTest

    const peers = getConnectedPeersWithSpies(peerNetwork.peerManager, 45)

    const newBlock = await useMinerBlockFixture(chain)

    // Accept transactions into mempool so the node can fill the compact block
    // without an additional request
    for (const transaction of newBlock.transactions.slice(1)) {
      node.memPool.acceptTransaction(transaction)
    }

    for (const { peer } of peers) {
      await peerNetwork.peerManager.onMessage.emitAsync(...newHashMessageEvent(peer, newBlock))
    }

    jest.runOnlyPendingTimers()

    const telemetrySpy = jest.spyOn(node.telemetry, 'submitNewBlockSeen')

    const sentPeers = peers.filter(({ sendSpy }) => sendSpy.mock.calls.length > 0)
    const call = sentPeers[0].sendSpy.mock.calls[0][0] as GetCompactBlockRequest

    const compactBlock = newBlock.toCompactBlock()
    const message = new GetCompactBlockResponse(compactBlock, call.rpcId)
    for (const { peer } of sentPeers) {
      await peerNetwork.peerManager.onMessage.emitAsync(...peerMessage(peer, message))
    }

    expect(telemetrySpy).toHaveBeenCalledWith(
      expect.any(Block),
      expect.any(Date),
      peers[0].peer.state.identity,
    )

    const calledBlockHash = telemetrySpy.mock.calls[0][0].header.hash
    expect(calledBlockHash).toEqual(newBlock.header.hash)

    await peerNetwork.stop()
  })
})
