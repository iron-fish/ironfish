/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { blake3 } from '@napi-rs/blake-hash'
import { v4 as uuid } from 'uuid'
import { VerificationResultReason } from '../consensus'
import { IronfishNode } from '../node'
import { Block, BlockSerde } from '../primitives/block'
import { BlockHash } from '../primitives/blockheader'
import { TransactionHash } from '../primitives/transaction'
import {
  createNodeTest,
  useAccountFixture,
  useBlockWithTx,
  useMinerBlockFixture,
} from '../testUtilities'
import {
  GetBlockTransactionsRequest,
  GetBlockTransactionsResponse,
} from './messages/getBlockTransactions'
import { GetCompactBlockRequest, GetCompactBlockResponse } from './messages/getCompactBlock'
import { IncomingPeerMessage, NetworkMessage } from './messages/networkMessage'
import { NewBlockMessage } from './messages/newBlock'
import { NewBlockHashesMessage } from './messages/newBlockHashes'
import { NewBlockV2Message } from './messages/newBlockV2'
import { NewPooledTransactionHashes } from './messages/newPooledTransactionHashes'
import { NewTransactionMessage } from './messages/newTransaction'
import { NewTransactionV2Message } from './messages/newTransactionV2'
import {
  PooledTransactionsRequest,
  PooledTransactionsResponse,
} from './messages/pooledTransactions'
import { Peer } from './peers/peer'
import { getConnectedPeer, getConnectedPeersWithSpies } from './testUtilities'
import { VERSION_PROTOCOL } from './version'

jest.mock('ws')
jest.useFakeTimers()

const newHashMessage = (
  peer: Peer,
  block: Block,
): IncomingPeerMessage<NewBlockHashesMessage> => {
  return messageEvent(
    peer,
    new NewBlockHashesMessage([{ hash: block.header.hash, sequence: block.header.sequence }]),
  )[1]
}

function messageEvent<T extends NetworkMessage>(
  peer: Peer,
  message: T,
): [Peer, IncomingPeerMessage<T>] {
  return [
    peer,
    {
      peerIdentity: peer.getIdentityOrThrow(),
      message,
    },
  ]
}

describe('BlockFetcher', () => {
  const nodeTest = createNodeTest()

  it('only requests one block if multiple hashes are received', async () => {
    const { peerNetwork, chain } = nodeTest
    chain.synced = true

    const peers = getConnectedPeersWithSpies(peerNetwork.peerManager, 5)

    const newBlock = await useMinerBlockFixture(chain)
    const hash = newBlock.header.hash

    for (const { peer } of peers) {
      await peerNetwork.peerManager.onMessage.emitAsync(peer, newHashMessage(peer, newBlock))
    }

    jest.runOnlyPendingTimers()

    const sentPeers = peers.filter(({ sendSpy }) => sendSpy.mock.calls.length > 0)

    expect(sentPeers).toHaveLength(1)

    expect(sentPeers[0].sendSpy).toHaveBeenCalledWith(
      new GetCompactBlockRequest(hash, expect.any(Number)),
    )

    await peerNetwork.stop()
  })

  it('does not send a request for a block if received NewBlockMessage from another peer within 500ms', async () => {
    const { peerNetwork, chain } = nodeTest

    const block = await useMinerBlockFixture(chain)

    // The hash is received from 5 peers
    const peers = getConnectedPeersWithSpies(peerNetwork.peerManager, 5)

    for (const { peer } of peers) {
      await peerNetwork.peerManager.onMessage.emitAsync(peer, newHashMessage(peer, block))
    }

    // Another peer send the full block
    const { peer } = getConnectedPeer(peerNetwork.peerManager)
    const peerIdentity = peer.getIdentityOrThrow()
    const message = {
      peerIdentity,
      message: new NewBlockMessage(BlockSerde.serialize(block)),
    }

    await peerNetwork.peerManager.onMessage.emitAsync(peer, message)

    jest.runOnlyPendingTimers()

    const sentPeers = peers.filter(({ sendSpy }) => sendSpy.mock.calls.length > 0)

    expect(sentPeers).toHaveLength(0)

    await peerNetwork.stop()
  })

  it('does not send a request for a block if received NewBlockV2Message from another peer within 500ms', async () => {
    const { peerNetwork, chain } = nodeTest

    const block = await useMinerBlockFixture(chain)

    // The hash is received from 5 peers
    const peers = getConnectedPeersWithSpies(peerNetwork.peerManager, 5)

    for (const { peer } of peers) {
      await peerNetwork.peerManager.onMessage.emitAsync(peer, newHashMessage(peer, block))
    }

    // Another peer send the full block
    const { peer } = getConnectedPeer(peerNetwork.peerManager)
    const peerIdentity = peer.getIdentityOrThrow()
    const message = {
      peerIdentity,
      message: new NewBlockV2Message(block.toCompactBlock()),
    }

    await peerNetwork.peerManager.onMessage.emitAsync(peer, message)

    jest.runOnlyPendingTimers()

    const sentPeers = peers.filter(({ sendSpy }) => sendSpy.mock.calls.length > 0)

    expect(sentPeers).toHaveLength(0)

    await peerNetwork.stop()
  })

  it('adds compact block to the chain when no additional transactions are needed', async () => {
    const { peerNetwork, chain } = nodeTest

    chain.synced = true
    const block = await useMinerBlockFixture(chain)

    // The hash is received from 5 peers
    const peers = getConnectedPeersWithSpies(peerNetwork.peerManager, 5)

    for (const { peer } of peers) {
      await peerNetwork.peerManager.onMessage.emitAsync(peer, newHashMessage(peer, block))
    }

    // We wait 500ms and then send the request for the block to a random peer
    jest.runOnlyPendingTimers()

    const sentPeers = peers.filter(({ sendSpy }) => sendSpy.mock.calls.length > 0)
    expect(sentPeers).toHaveLength(1)

    // The peer we requested responds with the full transaction
    const sentPeer = sentPeers[0].peer
    const sentMessage = sentPeers[0].sendSpy.mock.calls[0][0]
    expect(sentMessage).toBeInstanceOf(GetCompactBlockRequest)
    const rpcId = (sentMessage as GetCompactBlockRequest).rpcId
    const message = {
      peerIdentity: sentPeer.getIdentityOrThrow(),
      message: new GetCompactBlockResponse(block.toCompactBlock(), rpcId),
    }

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

    chain.synced = true
    // Another node creates a block with a transaction
    const { block, transaction } = await useBlockWithTx(node)

    // Block should be one ahead of our current chain
    expect(block.header.sequence - chain.head.sequence).toEqual(1)

    // We receive the transaction in our mempool
    await node.memPool.acceptTransaction(transaction)

    // Create 5 connected peers
    const peers = getConnectedPeersWithSpies(peerNetwork.peerManager, 5)

    const compactBlockMessage = messageEvent(
      peers[0].peer,
      new NewBlockV2Message(block.toCompactBlock()),
    )

    expect(await chain.hasBlock(block.header.hash)).toBe(false)

    // Get compact block from peer and fill missing txs from mempool
    await peerNetwork.peerManager.onMessage.emitAsync(...compactBlockMessage)

    expect(await chain.hasBlock(block.header.hash)).toBe(true)

    // Block should be gossiped to peers who have not seen it
    for (const { sendSpy } of peers.slice(1)) {
      expect(sendSpy.mock.calls).toHaveLength(1)
      // expect(sendSpy.mock.calls[0][0]).toBe()
    }

    await peerNetwork.stop()
  })

  it('fills missing transactions from transaction request if not in mempool', async () => {
    const { peerNetwork, chain, node } = nodeTest

    chain.synced = true
    const { block, transaction } = await useBlockWithTx(node)

    // Block should be one ahead of our current chain
    expect(block.header.sequence - chain.head.sequence).toEqual(1)

    // Connect to 5 peers and send hash messages of the block
    const peers = getConnectedPeersWithSpies(peerNetwork.peerManager, 5)
    for (const { peer } of peers) {
      await peerNetwork.peerManager.onMessage.emitAsync(peer, newHashMessage(peer, block))
    }

    // We wait 500ms and then send the request for the block to a random peer
    jest.runOnlyPendingTimers()

    const sentPeers = peers.filter(({ sendSpy }) => sendSpy.mock.calls.length > 0)
    expect(sentPeers).toHaveLength(1)

    // The peer we requested responds with the compact block
    const sentPeer = sentPeers[0].peer
    const sentMessage = sentPeers[0].sendSpy.mock.calls[0][0] as GetCompactBlockRequest
    expect(sentMessage).toBeInstanceOf(GetCompactBlockRequest)
    const compactBlockResponse = messageEvent(
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
    expect(getBlockTransactionsRequest.transactionIndexes).toEqual([1])

    // We should not have sent messages to any other peers
    const sentPeers2 = peers.filter(({ sendSpy }) => {
      return sendSpy.mock.calls.length > 0
    })
    expect(sentPeers2).toHaveLength(1)

    // The peer we requested responds with the transaction
    const response = new GetBlockTransactionsResponse(
      block.header.hash,
      [transaction.serialize()],
      getBlockTransactionsRequest.rpcId,
    )

    await peerNetwork.peerManager.onMessage.emitAsync(...messageEvent(sentPeer, response))

    // The block should now be in the chain
    await expect(chain.hasBlock(block.header.hash)).resolves.toBe(true)

    // Run timers to make sure we would not have sent messages to any other peers
    jest.runOnlyPendingTimers()

    const sentPeers3 = peers.filter(({ sendSpy }) => sendSpy.mock.calls.length > 0)
    expect(sentPeers3).toHaveLength(1)

    await peerNetwork.stop()
  })

  it('does not request compact block when node has block in blockchain', async () => {
    const { peerNetwork, chain } = nodeTest

    chain.synced = true
    const block = await useMinerBlockFixture(chain)

    await expect(chain).toAddBlock(block)

    const { peer, sendSpy } = getConnectedPeersWithSpies(peerNetwork.peerManager, 1)[0]

    expect(peer.knownBlockHashes.has(block.header.hash)).toBe(false)

    await peerNetwork.peerManager.onMessage.emitAsync(peer, newHashMessage(peer, block))

    jest.runOnlyPendingTimers()

    expect(sendSpy.mock.calls).toHaveLength(0)

    await peerNetwork.stop()
  })

  it('does not request compact block when block was previously marked as invalid', async () => {
    const { peerNetwork, chain } = nodeTest

    chain.synced = true
    const block = await useMinerBlockFixture(chain)

    chain.addInvalid(block.header, VerificationResultReason.ERROR)

    const { peer, sendSpy } = getConnectedPeersWithSpies(peerNetwork.peerManager, 1)[0]

    expect(peer.knownBlockHashes.has(block.header.hash)).toBe(false)

    await peerNetwork.peerManager.onMessage.emitAsync(peer, newHashMessage(peer, block))

    jest.runOnlyPendingTimers()

    expect(sendSpy.mock.calls).toHaveLength(0)

    await peerNetwork.stop()
  })

  it('does not request compact block when block was previously marked as an orphan', async () => {
    const { peerNetwork, chain } = nodeTest

    chain.synced = true
    const block = await useMinerBlockFixture(chain)

    chain.addOrphan(block.header)

    const { peer, sendSpy } = getConnectedPeersWithSpies(peerNetwork.peerManager, 1)[0]

    expect(peer.knownBlockHashes.has(block.header.hash)).toBe(false)

    await peerNetwork.peerManager.onMessage.emitAsync(peer, newHashMessage(peer, block))

    jest.runOnlyPendingTimers()

    expect(sendSpy.mock.calls).toHaveLength(0)

    await peerNetwork.stop()
  })
})
