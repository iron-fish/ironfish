/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
jest.mock('ws')

import type WSWebSocket from 'ws'
import http from 'http'
import net from 'net'
import { v4 as uuid } from 'uuid'
import ws from 'ws'
import { Assert } from '../assert'
import { VerificationResultReason } from '../consensus/verifier'
import {
  useAccountFixture,
  useBlockWithTx,
  useMinerBlockFixture,
  useMinersTxFixture,
} from '../testUtilities'
import { makeBlockAfter } from '../testUtilities/helpers/blockchain'
import { mockChain, mockNode, mockStrategy } from '../testUtilities/mocks'
import { createNodeTest } from '../testUtilities/nodeTest'
import { CannotSatisfyRequest } from './messages/cannotSatisfyRequest'
import { DisconnectingMessage } from './messages/disconnecting'
import {
  GetBlockTransactionsRequest,
  GetBlockTransactionsResponse,
} from './messages/getBlockTransactions'
import { NewBlockMessage } from './messages/newBlock'
import { NewTransactionMessage } from './messages/newTransaction'
import { PeerListMessage } from './messages/peerList'
import {
  PooledTransactionsRequest,
  PooledTransactionsResponse,
} from './messages/pooledTransactions'
import { PeerNetwork } from './peerNetwork'
import { Peer } from './peers/peer'
import { getConnectedPeer, mockHostsStore, mockPrivateIdentity } from './testUtilities'
import { NetworkMessageType } from './types'

jest.useFakeTimers()

describe('PeerNetwork', () => {
  describe('stop', () => {
    it('stops the peer manager', async () => {
      const peerNetwork = new PeerNetwork({
        identity: mockPrivateIdentity('local'),
        agent: 'sdk/1/cli',
        webSocket: ws,
        node: mockNode(),
        chain: mockChain(),
        strategy: mockStrategy(),
        hostsStore: mockHostsStore(),
      })

      const stopSpy = jest.spyOn(peerNetwork.peerManager, 'stop')
      await peerNetwork.stop()
      expect(stopSpy).toBeCalled()
    })
  })

  describe('when validation fails', () => {
    it('throws an exception', async () => {
      const peerNetwork = new PeerNetwork({
        identity: mockPrivateIdentity('local'),
        agent: 'sdk/1/cli',
        webSocket: ws,
        node: mockNode(),
        chain: mockChain(),
        strategy: mockStrategy(),
        hostsStore: mockHostsStore(),
      })

      const { peer } = getConnectedPeer(peerNetwork.peerManager)
      const message = new PeerListMessage([])
      await expect(
        peerNetwork['handleMessage'](peer, {
          peerIdentity: peer.getIdentityOrThrow(),
          message,
        }),
      ).rejects.not.toBeUndefined()
      await peerNetwork.stop()
    })
  })

  describe('when peers connect', () => {
    it('changes isReady', async () => {
      const peerNetwork = new PeerNetwork({
        identity: mockPrivateIdentity('local'),
        agent: 'sdk/1/cli',
        webSocket: ws,
        node: mockNode(),
        chain: mockChain(),
        strategy: mockStrategy(),
        minPeers: 1,
        hostsStore: mockHostsStore(),
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

      await peerNetwork.stop()
      expect(peerNetwork.isReady).toBe(false)

      expect(readyChanged).toBeCalledTimes(2)
      expect(readyChanged).toHaveBeenNthCalledWith(1, true)
      expect(readyChanged).toHaveBeenNthCalledWith(2, false)
    })
  })

  describe('when at max peers', () => {
    it('rejects websocket connections', async () => {
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
        hostsStore: mockHostsStore(),
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
      await peerNetwork.stop()

      expect(rejectSpy).toHaveBeenCalled()
      expect(sendSpy).toHaveBeenCalled()
      expect(closeSpy).toHaveBeenCalled()

      // Check that the disconnect message was serialized properly
      const args = sendSpy.mock.calls[0][0]
      expect(typeof args).toEqual('string')
      const message = JSON.parse(args) as DisconnectingMessage
      expect(message.type).toEqual(NetworkMessageType.Disconnecting)
    })
  })

  describe('handles requests for block transactions', () => {
    const nodeTest = createNodeTest()

    it('should respond to GetBlockTransactionsRequest', async () => {
      const { peerNetwork, node } = nodeTest

      const account = await useAccountFixture(node.accounts, 'accountA')
      const block = await useMinerBlockFixture(node.chain, undefined, account, node.accounts)
      const transaction1 = block.transactions[0]
      const transaction2 = await useMinersTxFixture(node.accounts, account)
      const transaction3 = await useMinersTxFixture(node.accounts, account)

      await expect(node.chain).toAddBlock(block)

      await node.chain.transactions.put(block.header.hash, {
        transactions: [transaction1, transaction2, transaction3],
      })

      const { peer } = getConnectedPeer(peerNetwork.peerManager)
      const peerIdentity = peer.getIdentityOrThrow()

      const sendSpy = jest.spyOn(peer, 'send')

      const rpcId = 432
      const message = new GetBlockTransactionsRequest(block.header.hash, [0, 1], rpcId)
      const response = new GetBlockTransactionsResponse(
        block.header.hash,
        [transaction1.serialize(), transaction3.serialize()],
        rpcId,
      )

      await peerNetwork.peerManager.onMessage.emitAsync(peer, { peerIdentity, message })

      expect(sendSpy).toHaveBeenCalledWith(response)
    })

    it('responds with CannotSatisfy when requesting transactions from an old block', async () => {
      const { peerNetwork, node } = nodeTest

      const account = await useAccountFixture(node.accounts, 'accountA')
      for (let i = 0; i < 11; i++) {
        const block = await useMinerBlockFixture(node.chain, undefined, account, node.accounts)
        await expect(node.chain).toAddBlock(block)
      }

      const { peer } = getConnectedPeer(peerNetwork.peerManager)
      const peerIdentity = peer.getIdentityOrThrow()

      const sendSpy = jest.spyOn(peer, 'send')

      const rpcId = 432
      const message = new GetBlockTransactionsRequest(node.chain.genesis.hash, [0], rpcId)
      const response = new CannotSatisfyRequest(rpcId)

      await peerNetwork.peerManager.onMessage.emitAsync(peer, { peerIdentity, message })

      expect(sendSpy).toHaveBeenCalledWith(response)
    })

    it('responds with CannotSatisfy on missing hash', async () => {
      const { peerNetwork } = nodeTest

      const { peer } = getConnectedPeer(peerNetwork.peerManager)
      const peerIdentity = peer.getIdentityOrThrow()

      const sendSpy = jest.spyOn(peer, 'send')

      const rpcId = 432
      const message = new GetBlockTransactionsRequest(Buffer.alloc(32, 1), [0, 1], rpcId)
      const response = new CannotSatisfyRequest(rpcId)

      await peerNetwork.peerManager.onMessage.emitAsync(peer, { peerIdentity, message })

      expect(sendSpy).toHaveBeenCalledWith(response)
    })

    it('responds with CannotSatisfy when requesting transactions past the end of the block', async () => {
      const { peerNetwork, node } = nodeTest

      const { peer } = getConnectedPeer(peerNetwork.peerManager)
      const peerIdentity = peer.getIdentityOrThrow()

      const sendSpy = jest.spyOn(peer, 'send')

      const rpcId = 432
      const genesisBlock = await node.chain.getBlock(node.chain.genesis.hash)
      Assert.isNotNull(genesisBlock)

      const message = new GetBlockTransactionsRequest(
        node.chain.genesis.hash,
        [genesisBlock.transactions.length + 1],
        rpcId,
      )
      const response = new CannotSatisfyRequest(rpcId)

      await peerNetwork.peerManager.onMessage.emitAsync(peer, { peerIdentity, message })

      expect(sendSpy).toHaveBeenCalledWith(response)
    })

    it('responds with CannotSatisfy when requesting transactions with negative indexes', async () => {
      const { peerNetwork, node } = nodeTest

      const { peer } = getConnectedPeer(peerNetwork.peerManager)
      const peerIdentity = peer.getIdentityOrThrow()

      const sendSpy = jest.spyOn(peer, 'send')

      const rpcId = 432
      const message = new GetBlockTransactionsRequest(node.chain.genesis.hash, [-1], rpcId)
      const response = new CannotSatisfyRequest(rpcId)

      await peerNetwork.peerManager.onMessage.emitAsync(peer, { peerIdentity, message })

      expect(sendSpy).toHaveBeenCalledWith(response)
    })
  })

  describe('when enable syncing is true', () => {
    it('adds new blocks', async () => {
      const peerNetwork = new PeerNetwork({
        identity: mockPrivateIdentity('local'),
        agent: 'sdk/1/cli',
        webSocket: ws,
        node: mockNode(),
        chain: mockChain(),
        strategy: mockStrategy(),
        hostsStore: mockHostsStore(),
      })

      const { peer } = getConnectedPeer(peerNetwork.peerManager)

      const block = {
        header: {
          graffiti: 'chipotle',
          minersFee: '0',
          noteCommitment: {
            commitment: Buffer.from('commitment'),
            size: 1,
          },
          nullifierCommitment: {
            commitment: 'commitment',
            size: 2,
          },
          previousBlockHash: 'burrito',
          randomness: '1',
          sequence: 2,
          target: 'icecream',
          timestamp: 200000,
          work: '123',
          hash: 'ramen',
        },
        transactions: [],
      }
      await peerNetwork['handleGossipMessage'](
        peer,
        new NewBlockMessage(block, Buffer.alloc(16, 'nonce')),
      )

      expect(peerNetwork['node']['syncer'].addNewBlock).toHaveBeenCalledWith(peer, block)
    })

    describe('handle block gossip', () => {
      const nodeTest = createNodeTest()

      it('should mark block hashes as known and known on peers', async () => {
        const { strategy, chain, peerNetwork, syncer } = nodeTest

        const genesis = await chain.getBlock(chain.genesis)
        Assert.isNotNull(genesis)

        strategy.disableMiningReward()
        syncer.blocksPerMessage = 1

        const blockA1 = await makeBlockAfter(chain, genesis)

        const { peer: peer1 } = getConnectedPeer(peerNetwork.peerManager)
        const { peer: peer2 } = getConnectedPeer(peerNetwork.peerManager)
        const { peer: peer3 } = getConnectedPeer(peerNetwork.peerManager)
        peer1.knownPeers.set(peer2.getIdentityOrThrow(), peer2)
        peer2.knownPeers.set(peer1.getIdentityOrThrow(), peer1)

        const newBlockMessage = new NewBlockMessage(strategy.blockSerde.serialize(blockA1))

        const peer1Send = jest.spyOn(peer1, 'send')
        const peer2Send = jest.spyOn(peer2, 'send')
        const peer3Send = jest.spyOn(peer3, 'send')

        await peerNetwork.peerManager.onMessage.emitAsync(peer1, {
          peerIdentity: peer1.getIdentityOrThrow(),
          message: newBlockMessage,
        })

        await peerNetwork['handleGossipMessage'](peer1, newBlockMessage)

        expect(peer1.knownBlockHashes.has(blockA1.header.hash)).toBe(true)
        expect(peer2.knownBlockHashes.has(blockA1.header.hash)).toBe(true)
        expect(peer3.knownBlockHashes.has(blockA1.header.hash)).toBe(true)
        expect(peer1Send).not.toBeCalled()
        expect(peer2Send).not.toBeCalled()
        expect(peer3Send).toBeCalledWith(newBlockMessage)
      })
    })

    describe('handles requests for mempool transactions', () => {
      const nodeTest = createNodeTest()

      it('should respond to PooledTransactionsRequest', async () => {
        const { peerNetwork, node } = nodeTest

        const { accounts, memPool } = node
        const accountA = await useAccountFixture(accounts, 'accountA')
        const accountB = await useAccountFixture(accounts, 'accountB')
        const { transaction } = await useBlockWithTx(node, accountA, accountB)
        await memPool.acceptTransaction(transaction)

        const peerIdentity = uuid()
        const peer = new Peer(peerIdentity)
        const sendSpy = jest.spyOn(peer, 'send')

        const rpcId = 432
        const message = new PooledTransactionsRequest([transaction.hash()], rpcId)
        const response = new PooledTransactionsResponse([transaction.serialize()], rpcId)

        peerNetwork.peerManager.onMessage.emit(peer, { peerIdentity, message })

        expect(sendSpy).toHaveBeenCalledWith(response)
      })
    })

    describe('handles new transactions', () => {
      const nodeTest = createNodeTest()
      it('does not accept or sync transactions when the worker pool is saturated', async () => {
        const { peerNetwork, node } = nodeTest

        const { accounts, memPool, workerPool } = node
        const accountA = await useAccountFixture(accounts, 'accountA')
        const accountB = await useAccountFixture(accounts, 'accountB')
        const { transaction } = await useBlockWithTx(node, accountA, accountB)

        Object.defineProperty(workerPool, 'saturated', { get: () => true })

        const acceptTransaction = jest.spyOn(memPool, 'acceptTransaction')
        const syncTransaction = jest.spyOn(accounts, 'syncTransaction')

        const { peer } = getConnectedPeer(peerNetwork.peerManager)

        const gossip = await peerNetwork['onNewTransaction'](
          peer,
          new NewTransactionMessage(transaction.serialize(), Buffer.alloc(16, 'nonce')),
        )

        expect(gossip).toBe(false)
        expect(acceptTransaction).not.toHaveBeenCalled()
        expect(syncTransaction).not.toHaveBeenCalled()
      })

      it('does not accept or sync transactions when the node is syncing', async () => {
        const { peerNetwork, node } = nodeTest

        const { accounts, memPool, chain } = node
        const accountA = await useAccountFixture(accounts, 'accountA')
        const accountB = await useAccountFixture(accounts, 'accountB')
        const { transaction } = await useBlockWithTx(node, accountA, accountB)

        chain.synced = false

        const acceptTransaction = jest.spyOn(memPool, 'acceptTransaction')
        const syncTransaction = jest.spyOn(accounts, 'syncTransaction')

        const { peer } = getConnectedPeer(peerNetwork.peerManager)

        const gossip = await peerNetwork['onNewTransaction'](
          peer,
          new NewTransactionMessage(transaction.serialize(), Buffer.alloc(16, 'nonce')),
        )

        expect(gossip).toBe(false)
        expect(acceptTransaction).not.toHaveBeenCalled()
        expect(syncTransaction).not.toHaveBeenCalled()
      })

      it('verifies and syncs the same transaction once', async () => {
        const { peerNetwork, node } = nodeTest
        const { accounts, memPool, chain } = node

        chain.synced = true
        const accountA = await useAccountFixture(accounts, 'accountA')
        const accountB = await useAccountFixture(accounts, 'accountB')
        const { transaction } = await useBlockWithTx(node, accountA, accountB)

        const verifyNewTransactionSpy = jest.spyOn(node.chain.verifier, 'verifyNewTransaction')

        const verifyTransactionContextual = jest.spyOn(
          node.chain.verifier,
          'verifyTransactionNoncontextual',
        )

        const { peer } = getConnectedPeer(peerNetwork.peerManager)

        const acceptTransaction = jest.spyOn(node.memPool, 'acceptTransaction')
        const syncTransaction = jest.spyOn(node.accounts, 'syncTransaction')

        const message = new NewTransactionMessage(transaction.serialize())

        let gossip = await peerNetwork['onNewTransaction'](peer, message)

        expect(gossip).toBe(true)

        expect(verifyNewTransactionSpy).toHaveBeenCalledTimes(1)
        expect(verifyTransactionContextual).toHaveBeenCalledTimes(1)

        expect(memPool.exists(transaction.hash())).toBe(true)
        expect(acceptTransaction).toHaveBeenCalledTimes(1)

        expect(syncTransaction).toHaveBeenCalledTimes(1)

        expect(peer.knownTransactionHashes.has(transaction.hash())).toBe(true)

        gossip = await peerNetwork['onNewTransaction'](peer, message)

        // These functions should still only be called once
        expect(gossip).toBe(false)

        expect(verifyNewTransactionSpy).toHaveBeenCalledTimes(1)
        expect(verifyTransactionContextual).toHaveBeenCalledTimes(1)

        expect(acceptTransaction).toHaveBeenCalledTimes(1)

        expect(syncTransaction).toHaveBeenCalledTimes(1)

        expect(peer.knownTransactionHashes.has(transaction.hash())).toBe(true)
      })

      it('does not syncs or gossip invalid transactions', async () => {
        const { peerNetwork, node } = nodeTest
        const { accounts, memPool, chain } = node

        chain.synced = true

        const accountA = await useAccountFixture(accounts, 'accountA')
        const accountB = await useAccountFixture(accounts, 'accountB')
        const { transaction } = await useBlockWithTx(node, accountA, accountB)

        const verifyNewTransactionSpy = jest.spyOn(node.chain.verifier, 'verifyNewTransaction')

        const verifyTransactionContextual = jest
          .spyOn(node.chain.verifier, 'verifyTransactionNoncontextual')
          .mockResolvedValueOnce({
            valid: false,
            reason: VerificationResultReason.DOUBLE_SPEND,
          })

        const { peer } = getConnectedPeer(peerNetwork.peerManager)

        const acceptTransaction = jest.spyOn(node.memPool, 'acceptTransaction')
        const syncTransaction = jest.spyOn(node.accounts, 'syncTransaction')

        const message = new NewTransactionMessage(transaction.serialize())

        const gossip = await peerNetwork['onNewTransaction'](peer, message)

        expect(gossip).toBe(false)

        expect(verifyNewTransactionSpy).toHaveBeenCalledTimes(1)
        expect(verifyTransactionContextual).toHaveBeenCalledTimes(1)

        expect(memPool.exists(transaction.hash())).toBe(false)
        expect(acceptTransaction).not.toHaveBeenCalled()

        expect(syncTransaction).not.toHaveBeenCalled()

        expect(peer.knownTransactionHashes.has(transaction.hash())).toBe(true)
      })
    })
  })

  describe('when enable syncing is false', () => {
    const nodeTest = createNodeTest(false, { config: { enableSyncing: false } })

    it('does not handle blocks', async () => {
      const { peerNetwork, node } = nodeTest
      const { peer } = getConnectedPeer(peerNetwork.peerManager)

      const block = {
        header: {
          graffiti: 'chipotle',
          minersFee: '0',
          noteCommitment: {
            commitment: Buffer.from('commitment'),
            size: 1,
          },
          nullifierCommitment: {
            commitment: 'commitment',
            size: 2,
          },
          previousBlockHash: 'burrito',
          randomness: '1',
          sequence: 2,
          target: 'icecream',
          timestamp: 200000,
          work: '123',
          hash: 'ramen',
        },
        transactions: [],
      }

      jest.spyOn(node.syncer, 'addNewBlock')

      const peerIdentity = peer.getIdentityOrThrow()
      const gossip = await peerNetwork['onNewBlock']({
        peerIdentity,
        message: new NewBlockMessage(block, Buffer.alloc(16, 'nonce')),
      })

      expect(gossip).toBe(false)
      expect(node.syncer.addNewBlock).not.toHaveBeenCalled()
    })

    it('does not handle transactions', async () => {
      const { peerNetwork, node } = nodeTest

      const { accounts, memPool, chain } = node
      const accountA = await useAccountFixture(accounts, 'accountA')
      const accountB = await useAccountFixture(accounts, 'accountB')
      const { transaction } = await useBlockWithTx(node, accountA, accountB)

      const { peer } = getConnectedPeer(peerNetwork.peerManager)

      jest.spyOn(chain.verifier, 'verifyNewTransaction')
      jest.spyOn(memPool, 'acceptTransaction')

      const gossip = await peerNetwork['onNewTransaction'](
        peer,
        new NewTransactionMessage(transaction.serialize()),
      )

      expect(gossip).toBe(false)
      expect(chain.verifier.verifyNewTransaction).not.toHaveBeenCalled()
      expect(memPool.acceptTransaction).not.toHaveBeenCalled()
    })
  })
})
