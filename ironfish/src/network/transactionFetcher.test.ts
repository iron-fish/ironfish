/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { blake3 } from '@napi-rs/blake-hash'
import { v4 as uuid } from 'uuid'
import { IronfishNode } from '../node'
import { TransactionHash } from '../primitives/transaction'
import { createNodeTest, useAccountFixture, useBlockWithTx } from '../testUtilities'
import { IncomingPeerMessage } from './messages/networkMessage'
import { NewPooledTransactionHashes } from './messages/newPooledTransactionHashes'
import { NewTransactionMessage } from './messages/newTransaction'
import { NewTransactionV2Message } from './messages/newTransactionV2'
import {
  PooledTransactionsRequest,
  PooledTransactionsResponse,
} from './messages/pooledTransactions'
import { PeerNetwork } from './peerNetwork'
import { Peer } from './peers/peer'
import { getConnectedPeer } from './testUtilities'

jest.mock('ws')
jest.useFakeTimers()

const getValidTransactionOnBlock = async (node: IronfishNode) => {
  const accountA = await useAccountFixture(node.accounts, 'accountA')
  const accountB = await useAccountFixture(node.accounts, 'accountB')
  const { transaction, block } = await useBlockWithTx(node, accountA, accountB)
  return { transaction, accountA, accountB, block }
}

const getConnectedPeersWithSpies = (peerNetwork: PeerNetwork, count: number) => {
  return [...Array(count)].map((_) => {
    const { peer } = getConnectedPeer(peerNetwork.peerManager)
    const sendSpy = jest.spyOn(peer, 'send')

    return { peer, sendSpy }
  })
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

    const peers = getConnectedPeersWithSpies(peerNetwork, 5)
    const messagesToSend = peers.map(({ peer, sendSpy }) => {
      return { peer, message: newHashMessage(peer, hash), peerSpy: sendSpy }
    })

    messagesToSend.forEach(({ peer, message }) => {
      peerNetwork.peerManager.onMessage.emit(peer, message)
    })

    jest.runOnlyPendingTimers()

    const sentPeers = messagesToSend.filter(({ peerSpy }) => {
      return peerSpy.mock.calls.length > 0
    })

    expect(sentPeers).toHaveLength(1)

    expect(sentPeers[0].peerSpy).toHaveBeenCalledWith(
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
    const peers = getConnectedPeersWithSpies(peerNetwork, 5)
    const messagesToSend = peers.map(({ peer, sendSpy }) => {
      return { peer, message: newHashMessage(peer, hash), peerSpy: sendSpy }
    })

    for (const { peer, message } of messagesToSend) {
      await peerNetwork.peerManager.onMessage.emitAsync(peer, message)
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

    const sentPeers = messagesToSend.filter(({ peerSpy }) => {
      return peerSpy.mock.calls.length > 0
    })

    expect(sentPeers).toHaveLength(0)

    await peerNetwork.stop()
  })

  it('does not send a request for a transaction if received NewTransactionV2Message from another peer within 500ms', async () => {
    const { peerNetwork, chain, node } = nodeTest

    chain.synced = true
    const { transaction } = await getValidTransactionOnBlock(node)

    const hash = transaction.hash()

    // The hash is received from 5 peers
    const peers = getConnectedPeersWithSpies(peerNetwork, 5)
    const messagesToSend = peers.map(({ peer, sendSpy }) => {
      return { peer, message: newHashMessage(peer, hash), peerSpy: sendSpy }
    })

    for (const { peer, message } of messagesToSend) {
      await peerNetwork.peerManager.onMessage.emitAsync(peer, message)
    }

    // Another peer send the full transaction
    const { peer } = getConnectedPeer(peerNetwork.peerManager)
    const peerIdentity = peer.getIdentityOrThrow()
    const message = {
      peerIdentity,
      message: new NewTransactionV2Message(transaction.serialize()),
    }

    await peerNetwork.peerManager.onMessage.emitAsync(peer, message)

    jest.runOnlyPendingTimers()

    const sentPeers = messagesToSend.filter(({ peerSpy }) => {
      return peerSpy.mock.calls.length > 0
    })

    expect(sentPeers).toHaveLength(0)

    await peerNetwork.stop()
  })

  it('handles transaction response when the fetcher sends a request', async () => {
    const { peerNetwork, chain, node } = nodeTest

    chain.synced = true
    const { transaction } = await getValidTransactionOnBlock(node)

    const hash = transaction.hash()

    // The hash is received from 5 peers
    const messagesToSend = [...Array(5)].map((_) => {
      const { peer } = getConnectedPeer(peerNetwork.peerManager)
      const peerIdentity = peer.getIdentityOrThrow()
      const message: IncomingPeerMessage<NewPooledTransactionHashes> = {
        peerIdentity,
        message: new NewPooledTransactionHashes([hash]),
      }

      const peerSpy = jest.spyOn(peer, 'send')

      return { peer, message, peerSpy }
    })

    for (const { peer, message } of messagesToSend) {
      await peerNetwork.peerManager.onMessage.emitAsync(peer, message)
    }

    // We wait 500ms and then send the request for the transaction to a random peer
    jest.runOnlyPendingTimers()

    const sentPeers = messagesToSend.filter(({ peerSpy }) => {
      return peerSpy.mock.calls.length > 0
    })
    expect(sentPeers).toHaveLength(1)

    // The peer we requested responds with the full transaction
    const sentPeer = sentPeers[0].peer
    const sentMessage = sentPeers[0].peerSpy.mock.calls[0][0]
    expect(sentMessage).toBeInstanceOf(PooledTransactionsRequest)
    const rpcId = (sentMessage as PooledTransactionsRequest).rpcId
    const peerIdentity = sentPeer.getIdentityOrThrow()
    const message = {
      peerIdentity,
      message: new PooledTransactionsResponse([transaction.serialize()], rpcId),
    }

    expect(node.memPool.exists(transaction.hash())).toBe(false)

    await peerNetwork.peerManager.onMessage.emitAsync(sentPeer, message)

    expect(node.memPool.exists(transaction.hash())).toBe(true)

    // The timeout for the original request ends. This should not affect anything
    // since we've already received the response
    jest.runOnlyPendingTimers()

    const sentPeers2 = messagesToSend.filter(({ peerSpy }) => {
      return peerSpy.mock.calls.length > 0
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

    const { peer } = getConnectedPeer(peerNetwork.peerManager)
    const peerIdentity = peer.getIdentityOrThrow()
    const peerSpy = jest.spyOn(peer, 'send')

    const message: IncomingPeerMessage<NewPooledTransactionHashes> = {
      peerIdentity,
      message: new NewPooledTransactionHashes([hash]),
    }

    expect(peerNetwork.knowsTransaction(hash, peerIdentity)).toBe(false)

    await peerNetwork.peerManager.onMessage.emitAsync(peer, message)

    jest.runOnlyPendingTimers()

    expect(peerSpy.mock.calls).toHaveLength(0)

    await peerNetwork.stop()
  })

  it('does not send request when node has transaction in blockchain', async () => {
    const { peerNetwork, chain, node } = nodeTest

    chain.synced = true
    const { block, transaction } = await getValidTransactionOnBlock(node)

    const hash = transaction.hash()

    await expect(node.chain).toAddBlock(block)

    const { peer } = getConnectedPeer(peerNetwork.peerManager)
    const peerIdentity = peer.getIdentityOrThrow()
    const peerSpy = jest.spyOn(peer, 'send')

    const message: IncomingPeerMessage<NewPooledTransactionHashes> = {
      peerIdentity,
      message: new NewPooledTransactionHashes([hash]),
    }

    expect(peerNetwork.knowsTransaction(hash, peerIdentity)).toBe(false)

    await peerNetwork.peerManager.onMessage.emitAsync(peer, message)

    jest.runOnlyPendingTimers()

    expect(peerSpy.mock.calls).toHaveLength(0)

    await peerNetwork.stop()
  })

  it('sends request when node has transaction, but a peer does not', async () => {
    const { peerNetwork, chain, node } = nodeTest

    chain.synced = true
    const { block, transaction } = await getValidTransactionOnBlock(node)

    const hash = transaction.hash()

    await expect(node.chain).toAddBlock(block)

    const { peer: peerWithTransaction } = getConnectedPeer(peerNetwork.peerManager)
    const { peer: peerWithoutTransaction } = getConnectedPeer(peerNetwork.peerManager)
    const peerSpy = jest.spyOn(peerWithTransaction, 'send')

    const message: IncomingPeerMessage<NewPooledTransactionHashes> = {
      peerIdentity: peerWithTransaction.getIdentityOrThrow(),
      message: new NewPooledTransactionHashes([hash]),
    }

    await peerNetwork.peerManager.onMessage.emitAsync(peerWithTransaction, message)

    jest.runOnlyPendingTimers()

    expect(peerNetwork.knowsTransaction(hash, peerWithTransaction.getIdentityOrThrow())).toBe(
      true,
    )
    expect(
      peerNetwork.knowsTransaction(hash, peerWithoutTransaction.getIdentityOrThrow()),
    ).toBe(false)
    expect(peerSpy.mock.calls.length).toBe(1)

    await peerNetwork.stop()
  })

  it('requests from another peer if PooledTransactionsRequest times out', async () => {
    const { peerNetwork, chain, node } = nodeTest

    chain.synced = true
    const { transaction } = await getValidTransactionOnBlock(node)

    const hash = transaction.hash()

    // Create 2 peers and 2 hash messages to receive
    const peers = getConnectedPeersWithSpies(peerNetwork, 2)
    const messagesToSend = peers.map(({ peer, sendSpy }) => {
      return { peer, message: newHashMessage(peer, hash), peerSpy: sendSpy }
    })

    // The first peer sends a hash message
    const { peer: peer1, message: hashMessage1 } = messagesToSend[0]
    await peerNetwork.peerManager.onMessage.emitAsync(peer1, hashMessage1)

    // We wait 500ms and then send the request for the transaction to a random peer
    jest.runOnlyPendingTimers()

    // The second peer sends a hash message
    const { peer: peer2, message: hashMessage2 } = messagesToSend[1]
    await peerNetwork.peerManager.onMessage.emitAsync(peer2, hashMessage2)

    // Should only send a request to one peer
    const sentPeers = messagesToSend.filter(({ peerSpy }) => {
      return peerSpy.mock.calls.length > 0
    })
    expect(sentPeers).toHaveLength(1)

    // The peer we requested times out
    jest.runOnlyPendingTimers()

    // We should request from the second peer
    const sentPeers2 = messagesToSend.filter(({ peerSpy }) => {
      return peerSpy.mock.calls.length > 0
    })
    expect(sentPeers2).toHaveLength(2)

    await peerNetwork.stop()
  })

  it('requests from another peer if PooledTransactionsRequest fails because of disconnect', async () => {
    const { peerNetwork, chain, node } = nodeTest

    chain.synced = true
    const { transaction } = await getValidTransactionOnBlock(node)

    // Create 2 peers and 2 hash messages to receive
    const peers = getConnectedPeersWithSpies(peerNetwork, 2)
    const messagesToSend = peers.map(({ peer, sendSpy }) => {
      return { peer, message: newHashMessage(peer, transaction.hash()), peerSpy: sendSpy }
    })

    // The first peer sends a hash message
    const { peer: peer1, message: hashMessage1 } = messagesToSend[0]
    await peerNetwork.peerManager.onMessage.emitAsync(peer1, hashMessage1)

    // We wait 500ms and then send the request for the transaction to a random peer
    jest.runOnlyPendingTimers()

    // The second peer sends a hash message
    const { peer: peer2, message: hashMessage2 } = messagesToSend[1]
    await peerNetwork.peerManager.onMessage.emitAsync(peer2, hashMessage2)

    // Should only send a request to one peer
    const sentPeers = messagesToSend.filter(({ peerSpy }) => {
      return peerSpy.mock.calls.length > 0
    })
    expect(sentPeers).toHaveLength(1)

    // The peer we requested gets disconnected
    peer1.close()

    // We should request from the second peer
    const sentPeers2 = messagesToSend.filter(({ peerSpy }) => {
      return peerSpy.mock.calls.length > 0
    })
    expect(sentPeers2).toHaveLength(2)

    await peerNetwork.stop()
  })
})
