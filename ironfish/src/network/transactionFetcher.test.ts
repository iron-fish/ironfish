/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { blake3 } from '@napi-rs/blake-hash'
import { v4 as uuid } from 'uuid'
import { IronfishNode } from '../node'
import { TransactionHash } from '../primitives/transaction'
import { createNodeTest, useAccountFixture, useBlockWithTx } from '../testUtilities'
import { IncomingPeerMessage, NetworkMessage } from './messages/networkMessage'
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

const getValidTransactionOnBlock = async (node: IronfishNode) => {
  const accountA = await useAccountFixture(node.accounts, 'accountA')
  const accountB = await useAccountFixture(node.accounts, 'accountB')
  const { transaction, block } = await useBlockWithTx(node, accountA, accountB)
  return { transaction, accountA, accountB, block }
}

const newHashMessage = (
  peer: Peer,
  hash: TransactionHash,
): IncomingPeerMessage<NewPooledTransactionHashes> => {
  const peerIdentity = peer.getIdentityOrThrow()
  return {
    peerIdentity,
    message: new NewPooledTransactionHashes([hash]),
  }
}

describe('TransactionFetcher', () => {
  const nodeTest = createNodeTest()

  it('only requests one transaction if multiple hashes are received', async () => {
    const { peerNetwork, chain } = nodeTest
    chain.synced = true

    const hash = blake3(uuid())

    const peers = getConnectedPeersWithSpies(peerNetwork.peerManager, 5)

    for (const { peer } of peers) {
      await peerNetwork.peerManager.onMessage.emitAsync(peer, newHashMessage(peer, hash))
    }

    jest.runOnlyPendingTimers()

    const sentPeers = peers.filter(({ sendSpy }) => sendSpy.mock.calls.length > 0)

    expect(sentPeers).toHaveLength(1)

    expect(sentPeers[0].sendSpy).toHaveBeenCalledWith(
      new PooledTransactionsRequest([hash], expect.any(Number)),
    )

    await peerNetwork.stop()
  })

  it('does not send a request for a transaction if received NewTransactionMessage from another peer within 500ms', async () => {
    const { peerNetwork, chain, node } = nodeTest

    chain.synced = true
    const { transaction } = await getValidTransactionOnBlock(node)

    const hash = transaction.hash()

    // The hash is received from 5 peers
    const peers = getConnectedPeersWithSpies(peerNetwork.peerManager, 5)

    for (const { peer } of peers) {
      await peerNetwork.peerManager.onMessage.emitAsync(peer, newHashMessage(peer, hash))
    }

    // Another peer send the full transaction
    const { peer } = getConnectedPeer(peerNetwork.peerManager)
    const peerIdentity = peer.getIdentityOrThrow()
    const message = {
      peerIdentity,
      message: new NewTransactionMessage(transaction.serialize()),
    }

    await peerNetwork.peerManager.onMessage.emitAsync(peer, message)

    jest.runOnlyPendingTimers()

    const sentPeers = peers.filter(({ sendSpy }) => sendSpy.mock.calls.length > 0)

    expect(sentPeers).toHaveLength(0)

    await peerNetwork.stop()
  })

  it('does not send a request for a transaction if received NewTransactionV2Message from another peer within 500ms', async () => {
    const { peerNetwork, chain, node } = nodeTest

    chain.synced = true
    const { transaction } = await getValidTransactionOnBlock(node)

    const hash = transaction.hash()

    // The hash is received from 5 peers
    const peers = getConnectedPeersWithSpies(peerNetwork.peerManager, 5)

    for (const { peer } of peers) {
      await peerNetwork.peerManager.onMessage.emitAsync(peer, newHashMessage(peer, hash))
    }

    // Another peer send the full transaction
    const { peer } = getConnectedPeer(peerNetwork.peerManager)
    const peerIdentity = peer.getIdentityOrThrow()
    const message = {
      peerIdentity,
      message: new NewTransactionV2Message([transaction.serialize()]),
    }

    await peerNetwork.peerManager.onMessage.emitAsync(peer, message)

    jest.runOnlyPendingTimers()

    const sentPeers = peers.filter(({ sendSpy }) => sendSpy.mock.calls.length > 0)

    expect(sentPeers).toHaveLength(0)

    await peerNetwork.stop()
  })

  it('handles transaction response when the fetcher sends a request', async () => {
    const { peerNetwork, chain, node } = nodeTest

    chain.synced = true
    const { transaction } = await getValidTransactionOnBlock(node)

    const hash = transaction.hash()

    // The hash is received from 5 peers
    const peers = getConnectedPeersWithSpies(peerNetwork.peerManager, 5)

    for (const { peer } of peers) {
      await peerNetwork.peerManager.onMessage.emitAsync(peer, newHashMessage(peer, hash))
    }

    // We wait 500ms and then send the request for the transaction to a random peer
    jest.runOnlyPendingTimers()

    const sentPeers = peers.filter(({ sendSpy }) => sendSpy.mock.calls.length > 0)
    expect(sentPeers).toHaveLength(1)

    // The peer we requested responds with the full transaction
    const sentPeer = sentPeers[0].peer
    const sentMessage = sentPeers[0].sendSpy.mock.calls[0][0]
    expect(sentMessage).toBeInstanceOf(PooledTransactionsRequest)
    const rpcId = (sentMessage as PooledTransactionsRequest).rpcId
    const message = {
      peerIdentity: sentPeer.getIdentityOrThrow(),
      message: new PooledTransactionsResponse([transaction.serialize()], rpcId),
    }

    expect(node.memPool.exists(transaction.hash())).toBe(false)

    await peerNetwork.peerManager.onMessage.emitAsync(sentPeer, message)

    expect(node.memPool.exists(transaction.hash())).toBe(true)

    // The timeout for the original request ends. This should not affect anything
    // since we've already received the response
    jest.runOnlyPendingTimers()

    const sentPeers2 = peers.filter(({ sendSpy }) => {
      return sendSpy.mock.calls.length > 0
    })
    expect(sentPeers2).toHaveLength(1)

    await peerNetwork.stop()
  })

  it('does not send request when node has transaction in mempool', async () => {
    const { peerNetwork, chain, node } = nodeTest

    chain.synced = true
    const { transaction } = await getValidTransactionOnBlock(node)

    const hash = transaction.hash()

    expect(await node.memPool.acceptTransaction(transaction)).toBe(true)

    const { peer, sendSpy } = getConnectedPeersWithSpies(peerNetwork.peerManager, 1)[0]
    const peerIdentity = peer.getIdentityOrThrow()

    expect(peerNetwork.knowsTransaction(hash, peerIdentity)).toBe(false)

    await peerNetwork.peerManager.onMessage.emitAsync(peer, newHashMessage(peer, hash))

    jest.runOnlyPendingTimers()

    expect(sendSpy.mock.calls).toHaveLength(0)

    await peerNetwork.stop()
  })

  it('does not send request when node has transaction in blockchain', async () => {
    const { peerNetwork, chain, node } = nodeTest

    chain.synced = true
    const { block, transaction } = await getValidTransactionOnBlock(node)

    const hash = transaction.hash()

    await expect(node.chain).toAddBlock(block)

    const { peer, sendSpy } = getConnectedPeersWithSpies(peerNetwork.peerManager, 1)[0]
    const peerIdentity = peer.getIdentityOrThrow()

    expect(peerNetwork.knowsTransaction(hash, peerIdentity)).toBe(false)

    await peerNetwork.peerManager.onMessage.emitAsync(peer, newHashMessage(peer, hash))

    jest.runOnlyPendingTimers()

    expect(sendSpy.mock.calls).toHaveLength(0)

    await peerNetwork.stop()
  })

  it('gossips transaction but does not request again when node has transaction in mempool', async () => {
    const { peerNetwork, chain, node } = nodeTest

    chain.synced = true
    const { transaction } = await getValidTransactionOnBlock(node)

    const hash = transaction.hash()

    expect(await node.memPool.acceptTransaction(transaction)).toBe(true)

    // Get 5 peers on the most recent version
    const peers = getConnectedPeersWithSpies(peerNetwork.peerManager, 5)
    for (const { peer } of peers) {
      peer.version = VERSION_PROTOCOL
    }
    const { peer, sendSpy } = peers[0]
    const peerIdentity = peer.getIdentityOrThrow()

    expect(peerNetwork.knowsTransaction(hash, peerIdentity)).toBe(false)

    // The first peer sends us the transaction hash
    await peerNetwork.peerManager.onMessage.emitAsync(peer, newHashMessage(peer, hash))

    jest.runOnlyPendingTimers()

    // We should not request the full transaction from the peer since we already have it in the mempool
    expect(sendSpy.mock.calls).toHaveLength(0)

    const peersWithoutTransaction = peers.slice(1)

    const isTransactionGossip = (m: NetworkMessage) => {
      return m instanceof NewTransactionV2Message || m instanceof NewPooledTransactionHashes
    }

    // We should still gossip the transaction to other peers who have not seen it yet
    for (const { sendSpy } of peersWithoutTransaction) {
      expect(sendSpy.mock.calls).toHaveLength(1)
      expect(isTransactionGossip(sendSpy.mock.calls[0][0])).toBe(true)
    }

    await peerNetwork.stop()
  })

  it('requests from another peer if PooledTransactionsRequest times out', async () => {
    const { peerNetwork, chain, node } = nodeTest

    chain.synced = true
    const { transaction } = await getValidTransactionOnBlock(node)

    const hash = transaction.hash()

    // Create 2 peers
    const peers = getConnectedPeersWithSpies(peerNetwork.peerManager, 2)

    // The first peer sends a hash message
    const peer1 = peers[0].peer
    await peerNetwork.peerManager.onMessage.emitAsync(peer1, newHashMessage(peer1, hash))

    // We wait 500ms and then send the request for the transaction to a random peer
    jest.runOnlyPendingTimers()

    // The second peer sends a hash message
    const peer2 = peers[1].peer
    await peerNetwork.peerManager.onMessage.emitAsync(peer2, newHashMessage(peer2, hash))

    // Should only send a request to one peer
    const sentPeersBefore = peers.filter(({ sendSpy }) => sendSpy.mock.calls.length > 0)
    expect(sentPeersBefore).toHaveLength(1)

    // The peer we requested times out
    jest.runOnlyPendingTimers()

    // We should request from the second peer
    const sentPeersAfter = peers.filter(({ sendSpy }) => sendSpy.mock.calls.length > 0)
    expect(sentPeersAfter).toHaveLength(2)

    await peerNetwork.stop()
  })

  it('requests from another peer if PooledTransactionsRequest fails because of disconnect', async () => {
    const { peerNetwork, chain, node } = nodeTest

    chain.synced = true
    const { transaction } = await getValidTransactionOnBlock(node)

    // Create 2 peers
    const peers = getConnectedPeersWithSpies(peerNetwork.peerManager, 2)

    // The first peer sends a hash message
    const peer1 = peers[0].peer
    await peerNetwork.peerManager.onMessage.emitAsync(
      peer1,
      newHashMessage(peer1, transaction.hash()),
    )

    // We wait 500ms and then send the request for the transaction to a random peer
    jest.runOnlyPendingTimers()

    // The second peer sends a hash message
    const peer2 = peers[1].peer
    await peerNetwork.peerManager.onMessage.emitAsync(
      peer2,
      newHashMessage(peer2, transaction.hash()),
    )

    // Should only send a request to one peer
    const sentPeers = peers.filter(({ sendSpy }) => sendSpy.mock.calls.length > 0)
    expect(sentPeers).toHaveLength(1)

    // The peer we requested gets disconnected
    peer1.close()

    // We should request from the second peer
    const sentPeersAfter = peers.filter(({ sendSpy }) => sendSpy.mock.calls.length > 0)
    expect(sentPeersAfter).toHaveLength(2)

    await peerNetwork.stop()
  })
})
