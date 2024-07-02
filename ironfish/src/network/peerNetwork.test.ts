/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
jest.mock('ws')

import type WSWebSocket from 'ws'
import http from 'http'
import net from 'net'
import ws from 'ws'
import { Assert } from '../assert'
import { VerificationResultReason } from '../consensus/verifier'
import { Block, Transaction } from '../primitives'
import { CompactBlock } from '../primitives/block'
import {
  useAccountFixture,
  useBlockWithTx,
  useMinerBlockFixture,
  useMinersTxFixture,
  useTxFixture,
} from '../testUtilities'
import { mockChain, mockNode, mockTelemetry } from '../testUtilities/mocks'
import { createNodeTest } from '../testUtilities/nodeTest'
import { parseNetworkMessage } from './messageRegistry'
import { CannotSatisfyRequest } from './messages/cannotSatisfyRequest'
import { DisconnectingMessage, DisconnectingReason } from './messages/disconnecting'
import { GetBlockHeadersRequest, GetBlockHeadersResponse } from './messages/getBlockHeaders'
import { GetBlocksRequest, GetBlocksResponse } from './messages/getBlocks'
import {
  GetBlockTransactionsRequest,
  GetBlockTransactionsResponse,
} from './messages/getBlockTransactions'
import { GetCompactBlockRequest, GetCompactBlockResponse } from './messages/getCompactBlock'
import { NewBlockHashesMessage } from './messages/newBlockHashes'
import { NewCompactBlockMessage } from './messages/newCompactBlock'
import { NewPooledTransactionHashes } from './messages/newPooledTransactionHashes'
import { NewTransactionsMessage } from './messages/newTransactions'
import { PeerListMessage } from './messages/peerList'
import {
  PooledTransactionsRequest,
  PooledTransactionsResponse,
} from './messages/pooledTransactions'
import { PeerNetwork } from './peerNetwork'
import { Peer } from './peers/peer'
import {
  expectGetBlockHeadersResponseToMatch,
  expectGetBlocksResponseToMatch,
  expectGetBlockTransactionsResponseToMatch,
  expectGetCompactBlockResponseToMatch,
  getConnectedPeer,
  getConnectedPeersWithSpies,
  mockPeerStore,
  mockPrivateIdentity,
  peerMessage,
} from './testUtilities'
import { NetworkMessageType } from './types'
import * as serializer from './utils/serializers'
import { VERSION_PROTOCOL } from './version'

jest.mock('./version', () => {
  const moduleMock = jest.requireActual<typeof import('./version')>('./version')
  return {
    ...moduleMock,
    MAX_REQUESTED_HEADERS: 4,
    MAX_HEADER_LOOKUPS: 8,
    MAX_BLOCK_LOOKUPS: 4,
  }
})

jest.useFakeTimers()

describe('PeerNetwork', () => {
  describe('stop', () => {
    const nodeTest = createNodeTest()
    it('stops the peer manager', async () => {
      const { peerNetwork } = nodeTest

      const stopSpy = jest.spyOn(peerNetwork.peerManager, 'stop')
      await peerNetwork.stop()
      expect(stopSpy).toHaveBeenCalled()
    })
  })

  describe('when validation fails', () => {
    const nodeTest = createNodeTest()

    it('throws an exception', async () => {
      const { peerNetwork } = nodeTest

      const { peer } = getConnectedPeer(peerNetwork.peerManager)
      const message = new PeerListMessage([])
      await expect(peerNetwork['handleMessage'](peer, message)).rejects.not.toBeUndefined()
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
        minPeers: 1,
        peerStore: mockPeerStore(),
        telemetry: mockTelemetry(),
        networkId: 1,
      })

      expect(peerNetwork.isReady).toBe(false)

      const readyChanged = jest.fn<(ready: boolean) => void>()
      peerNetwork.onIsReadyChanged.on(readyChanged)

      peerNetwork.start()
      expect(peerNetwork.isReady).toBe(false)

      const { peer } = getConnectedPeer(peerNetwork.peerManager)
      expect(peerNetwork.isReady).toBe(true)

      peer.close()
      expect(peerNetwork.isReady).toBe(false)

      await peerNetwork.stop()
      expect(peerNetwork.isReady).toBe(false)

      expect(readyChanged).toHaveBeenCalledTimes(2)
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
        listen: true,
        port: 0,
        minPeers: 1,
        maxPeers: 0,
        peerStore: mockPeerStore(),
        telemetry: mockTelemetry(),
        networkId: 1,
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
      expect(Buffer.isBuffer(args)).toBe(true)
      Assert.isInstanceOf(args, Buffer)
      const message = parseNetworkMessage(args)
      expect(message.type).toEqual(NetworkMessageType.Disconnecting)
      Assert.isInstanceOf(message, DisconnectingMessage)
      expect(message.reason).toEqual(DisconnectingReason.Congested)
    })
  })

  describe('handles requests for compact blocks', () => {
    const nodeTest = createNodeTest()

    it('should respond to GetCompactBlockRequest', async () => {
      const { peerNetwork, node } = nodeTest

      const account = await useAccountFixture(node.wallet, 'accountA')
      const block = await useMinerBlockFixture(node.chain, undefined, account, node.wallet)
      const transaction1 = block.transactions[0]
      const transaction2 = await useMinersTxFixture(node, account)
      const transaction3 = await useMinersTxFixture(node, account)

      await expect(node.chain).toAddBlock(block)

      await node.chain.putTransaction(block.header.hash, {
        transactions: [transaction1, transaction2, transaction3],
      })

      const compactBlock: CompactBlock = {
        header: block.header,
        transactions: [{ index: 0, transaction: transaction1 }],
        transactionHashes: [transaction2.hash(), transaction3.hash()],
      }

      const { peer } = getConnectedPeer(peerNetwork.peerManager)

      const sendSpy = jest.spyOn(peer, 'send')

      const rpcId = 432
      const message = new GetCompactBlockRequest(block.header.hash, rpcId)
      const response = new GetCompactBlockResponse(compactBlock, rpcId)

      await peerNetwork.peerManager.onMessage.emitAsync(peer, message)

      expect(sendSpy.mock.calls[0][0]).toBeInstanceOf(GetCompactBlockResponse)
      expectGetCompactBlockResponseToMatch(
        sendSpy.mock.calls[0][0] as GetCompactBlockResponse,
        response,
      )
    })

    it('responds with CannotSatisfy when requesting an old compact block', async () => {
      const { peerNetwork, node } = nodeTest

      const account = await useAccountFixture(node.wallet, 'accountA')
      for (let i = 0; i < 6; i++) {
        const block = await useMinerBlockFixture(node.chain, undefined, account, node.wallet)
        await expect(node.chain).toAddBlock(block)
      }

      const { peer } = getConnectedPeer(peerNetwork.peerManager)

      const sendSpy = jest.spyOn(peer, 'send')

      const rpcId = 432
      const message = new GetCompactBlockRequest(node.chain.genesis.hash, rpcId)
      const response = new CannotSatisfyRequest(rpcId)

      await peerNetwork.peerManager.onMessage.emitAsync(peer, message)

      expect(sendSpy).toHaveBeenCalledWith(response)
    })

    it('responds with CannotSatisfy on missing hash', async () => {
      const { peerNetwork } = nodeTest

      const { peer } = getConnectedPeer(peerNetwork.peerManager)

      const sendSpy = jest.spyOn(peer, 'send')

      const rpcId = 432
      const message = new GetCompactBlockRequest(Buffer.alloc(32, 1), rpcId)
      const response = new CannotSatisfyRequest(rpcId)

      await peerNetwork.peerManager.onMessage.emitAsync(peer, message)

      expect(sendSpy).toHaveBeenCalledWith(response)
    })
  })

  describe('handles requests for block transactions', () => {
    const nodeTest = createNodeTest()

    it('should respond to GetBlockTransactionsRequest', async () => {
      const { peerNetwork, node } = nodeTest

      const account = await useAccountFixture(node.wallet, 'accountA')
      const block = await useMinerBlockFixture(node.chain, undefined, account, node.wallet)
      const transaction1 = block.transactions[0]
      const transaction2 = await useMinersTxFixture(node, account)
      const transaction3 = await useMinersTxFixture(node, account)

      await expect(node.chain).toAddBlock(block)

      await node.chain.putTransaction(block.header.hash, {
        transactions: [transaction1, transaction2, transaction3],
      })

      const { peer } = getConnectedPeer(peerNetwork.peerManager)

      const sendSpy = jest.spyOn(peer, 'send')

      const rpcId = 432
      const message = new GetBlockTransactionsRequest(block.header.hash, [0, 1], rpcId)
      const response = new GetBlockTransactionsResponse(
        block.header.hash,
        [transaction1, transaction3],
        rpcId,
      )

      await peerNetwork.peerManager.onMessage.emitAsync(peer, message)

      expect(sendSpy.mock.calls[0][0]).toBeInstanceOf(GetBlockTransactionsResponse)
      expectGetBlockTransactionsResponseToMatch(
        sendSpy.mock.calls[0][0] as GetBlockTransactionsResponse,
        response,
      )
    })

    it('responds with CannotSatisfy when requesting transactions from an old block', async () => {
      const { peerNetwork, node } = nodeTest

      const account = await useAccountFixture(node.wallet, 'accountA')
      for (let i = 0; i < 11; i++) {
        const block = await useMinerBlockFixture(node.chain, undefined, account, node.wallet)
        await expect(node.chain).toAddBlock(block)
      }

      const { peer } = getConnectedPeer(peerNetwork.peerManager)

      const sendSpy = jest.spyOn(peer, 'send')

      const rpcId = 432
      const message = new GetBlockTransactionsRequest(node.chain.genesis.hash, [0], rpcId)
      const response = new CannotSatisfyRequest(rpcId)

      await peerNetwork.peerManager.onMessage.emitAsync(peer, message)

      expect(sendSpy).toHaveBeenCalledWith(response)
    })

    it('responds with CannotSatisfy on missing hash', async () => {
      const { peerNetwork } = nodeTest

      const { peer } = getConnectedPeer(peerNetwork.peerManager)

      const sendSpy = jest.spyOn(peer, 'send')

      const rpcId = 432
      const message = new GetBlockTransactionsRequest(Buffer.alloc(32, 1), [0, 1], rpcId)
      const response = new CannotSatisfyRequest(rpcId)

      await peerNetwork.peerManager.onMessage.emitAsync(peer, message)

      expect(sendSpy).toHaveBeenCalledWith(response)
    })

    it('responds with CannotSatisfy when requesting transactions past the end of the block', async () => {
      const { peerNetwork, node } = nodeTest

      const { peer } = getConnectedPeer(peerNetwork.peerManager)

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

      await peerNetwork.peerManager.onMessage.emitAsync(peer, message)

      expect(sendSpy).toHaveBeenCalledWith(response)
    })

    it('responds with CannotSatisfy when requesting transactions with negative indexes', async () => {
      const { peerNetwork, node } = nodeTest

      const { peer } = getConnectedPeer(peerNetwork.peerManager)

      const sendSpy = jest.spyOn(peer, 'send')

      const rpcId = 432
      const message = new GetBlockTransactionsRequest(node.chain.genesis.hash, [-1], rpcId)
      const response = new CannotSatisfyRequest(rpcId)

      await peerNetwork.peerManager.onMessage.emitAsync(peer, message)

      expect(sendSpy).toHaveBeenCalledWith(response)
    })
  })

  describe('handles requests for block headers', () => {
    const nodeTest = createNodeTest()

    it('should respond to GetBlockHeadersRequest', async () => {
      const { node, peerNetwork } = nodeTest
      const block2 = await useMinerBlockFixture(node.chain)
      await expect(node.chain).toAddBlock(block2)
      const block3 = await useMinerBlockFixture(node.chain)
      await expect(node.chain).toAddBlock(block3)
      const block4 = await useMinerBlockFixture(node.chain)
      await expect(node.chain).toAddBlock(block4)
      const block5 = await useMinerBlockFixture(node.chain)
      await expect(node.chain).toAddBlock(block5)

      const { peer } = getConnectedPeer(peerNetwork.peerManager)

      const sendSpy = jest.spyOn(peer, 'send')

      const rpcId = 432
      const message = new GetBlockHeadersRequest(2, 3, 0, false, rpcId)
      const response = new GetBlockHeadersResponse(
        [block2.header, block3.header, block4.header],
        rpcId,
      )

      await peerNetwork.peerManager.onMessage.emitAsync(peer, message)

      expect(sendSpy.mock.calls[0][0]).toBeInstanceOf(GetBlockHeadersResponse)
      expectGetBlockHeadersResponseToMatch(
        sendSpy.mock.calls[0][0] as GetBlockHeadersResponse,
        response,
      )
    })

    it('should respond to GetBlockHeadersRequest with skip', async () => {
      const { node, peerNetwork } = nodeTest
      const block2 = await useMinerBlockFixture(node.chain)
      await expect(node.chain).toAddBlock(block2)
      const block3 = await useMinerBlockFixture(node.chain)
      await expect(node.chain).toAddBlock(block3)
      const block4 = await useMinerBlockFixture(node.chain)
      await expect(node.chain).toAddBlock(block4)
      const block5 = await useMinerBlockFixture(node.chain)
      await expect(node.chain).toAddBlock(block5)
      const block6 = await useMinerBlockFixture(node.chain)
      await expect(node.chain).toAddBlock(block6)
      const block7 = await useMinerBlockFixture(node.chain)
      await expect(node.chain).toAddBlock(block7)
      const block8 = await useMinerBlockFixture(node.chain)
      await expect(node.chain).toAddBlock(block8)

      const { peer } = getConnectedPeer(peerNetwork.peerManager)

      const sendSpy = jest.spyOn(peer, 'send')

      const rpcId = 432
      const message = new GetBlockHeadersRequest(2, 3, 2, false, rpcId)
      const response = new GetBlockHeadersResponse(
        [block2.header, block5.header, block8.header],
        rpcId,
      )

      await peerNetwork.peerManager.onMessage.emitAsync(peer, message)

      expect(sendSpy.mock.calls[0][0]).toBeInstanceOf(GetBlockHeadersResponse)
      expectGetBlockHeadersResponseToMatch(
        sendSpy.mock.calls[0][0] as GetBlockHeadersResponse,
        response,
      )
    })

    it('should respond to GetBlockHeadersRequest with reverse', async () => {
      const { node, peerNetwork } = nodeTest
      const block2 = await useMinerBlockFixture(node.chain)
      await expect(node.chain).toAddBlock(block2)
      const block3 = await useMinerBlockFixture(node.chain)
      await expect(node.chain).toAddBlock(block3)
      const block4 = await useMinerBlockFixture(node.chain)
      await expect(node.chain).toAddBlock(block4)

      const { peer } = getConnectedPeer(peerNetwork.peerManager)

      const sendSpy = jest.spyOn(peer, 'send')

      const rpcId = 432
      const message = new GetBlockHeadersRequest(4, 3, 0, true, rpcId)
      const response = new GetBlockHeadersResponse(
        [block4.header, block3.header, block2.header],
        rpcId,
      )

      await peerNetwork.peerManager.onMessage.emitAsync(peer, message)

      expect(sendSpy.mock.calls[0][0]).toBeInstanceOf(GetBlockHeadersResponse)
      expectGetBlockHeadersResponseToMatch(
        sendSpy.mock.calls[0][0] as GetBlockHeadersResponse,
        response,
      )
    })

    it('should respond to GetBlockHeadersRequest with reverse and skip', async () => {
      const { node, peerNetwork } = nodeTest
      const block2 = await useMinerBlockFixture(node.chain)
      await expect(node.chain).toAddBlock(block2)
      const block3 = await useMinerBlockFixture(node.chain)
      await expect(node.chain).toAddBlock(block3)
      const block4 = await useMinerBlockFixture(node.chain)
      await expect(node.chain).toAddBlock(block4)

      const { peer } = getConnectedPeer(peerNetwork.peerManager)

      const sendSpy = jest.spyOn(peer, 'send')

      const rpcId = 432
      const message = new GetBlockHeadersRequest(4, 2, 1, true, rpcId)
      const response = new GetBlockHeadersResponse([block4.header, block2.header], rpcId)

      await peerNetwork.peerManager.onMessage.emitAsync(peer, message)

      expect(sendSpy.mock.calls[0][0]).toBeInstanceOf(GetBlockHeadersResponse)
      expectGetBlockHeadersResponseToMatch(
        sendSpy.mock.calls[0][0] as GetBlockHeadersResponse,
        response,
      )
    })

    it('should respond to GetBlockHeadersRequest with reverse, skip and start as buffer', async () => {
      const { node, peerNetwork } = nodeTest
      const block2 = await useMinerBlockFixture(node.chain)
      await expect(node.chain).toAddBlock(block2)
      const block3 = await useMinerBlockFixture(node.chain)
      await expect(node.chain).toAddBlock(block3)
      const block4 = await useMinerBlockFixture(node.chain)
      await expect(node.chain).toAddBlock(block4)

      const { peer } = getConnectedPeer(peerNetwork.peerManager)

      const sendSpy = jest.spyOn(peer, 'send')

      const rpcId = 432
      const message = new GetBlockHeadersRequest(block4.header.hash, 2, 1, true, rpcId)
      const response = new GetBlockHeadersResponse([block4.header, block2.header], rpcId)

      await peerNetwork.peerManager.onMessage.emitAsync(peer, message)

      expect(sendSpy.mock.calls[0][0]).toBeInstanceOf(GetBlockHeadersResponse)
      expectGetBlockHeadersResponseToMatch(
        sendSpy.mock.calls[0][0] as GetBlockHeadersResponse,
        response,
      )
    })

    it('responds with CannotSatisfy when requesting too many headers', async () => {
      const { node, peerNetwork } = nodeTest
      const block2 = await useMinerBlockFixture(node.chain)
      await expect(node.chain).toAddBlock(block2)

      const { peer } = getConnectedPeer(peerNetwork.peerManager)

      const sendSpy = jest.spyOn(peer, 'send')

      const rpcId = 432
      const message = new GetBlockHeadersRequest(block2.header.hash, 5, 1, false, rpcId)

      await peerNetwork.peerManager.onMessage.emitAsync(peer, message)

      expect(sendSpy.mock.calls[0][0]).toBeInstanceOf(CannotSatisfyRequest)
    })

    describe('lookup limit', () => {
      it('includes headers within the limit', async () => {
        const { node, peerNetwork } = nodeTest
        const block2 = await useMinerBlockFixture(node.chain)
        await expect(node.chain).toAddBlock(block2)
        const block3 = await useMinerBlockFixture(node.chain)
        await expect(node.chain).toAddBlock(block3)
        const block4 = await useMinerBlockFixture(node.chain)
        await expect(node.chain).toAddBlock(block4)
        const block5 = await useMinerBlockFixture(node.chain)
        await expect(node.chain).toAddBlock(block5)
        const block6 = await useMinerBlockFixture(node.chain)
        await expect(node.chain).toAddBlock(block6)
        const block7 = await useMinerBlockFixture(node.chain)
        await expect(node.chain).toAddBlock(block7)
        const block8 = await useMinerBlockFixture(node.chain)
        await expect(node.chain).toAddBlock(block8)
        const block9 = await useMinerBlockFixture(node.chain)
        await expect(node.chain).toAddBlock(block9)
        const block10 = await useMinerBlockFixture(node.chain)
        await expect(node.chain).toAddBlock(block10)

        const { peer } = getConnectedPeer(peerNetwork.peerManager)

        const sendSpy = jest.spyOn(peer, 'send')

        const rpcId = 432
        const message = new GetBlockHeadersRequest(block2.header.sequence, 4, 6, false, rpcId)
        // The start header, block2, is the first lookup. Then we skip 6,
        // resulting in 7 lookups. The 8th and final lookup is block9.
        const response = new GetBlockHeadersResponse([block2.header, block9.header], rpcId)

        await peerNetwork.peerManager.onMessage.emitAsync(peer, message)

        expect(sendSpy.mock.calls[0][0]).toBeInstanceOf(GetBlockHeadersResponse)
        expectGetBlockHeadersResponseToMatch(
          sendSpy.mock.calls[0][0] as GetBlockHeadersResponse,
          response,
        )
      })

      it('does not include headers beyond the limit', async () => {
        const { node, peerNetwork } = nodeTest
        const block2 = await useMinerBlockFixture(node.chain)
        await expect(node.chain).toAddBlock(block2)
        const block3 = await useMinerBlockFixture(node.chain)
        await expect(node.chain).toAddBlock(block3)
        const block4 = await useMinerBlockFixture(node.chain)
        await expect(node.chain).toAddBlock(block4)
        const block5 = await useMinerBlockFixture(node.chain)
        await expect(node.chain).toAddBlock(block5)
        const block6 = await useMinerBlockFixture(node.chain)
        await expect(node.chain).toAddBlock(block6)
        const block7 = await useMinerBlockFixture(node.chain)
        await expect(node.chain).toAddBlock(block7)
        const block8 = await useMinerBlockFixture(node.chain)
        await expect(node.chain).toAddBlock(block8)
        const block9 = await useMinerBlockFixture(node.chain)
        await expect(node.chain).toAddBlock(block9)
        const block10 = await useMinerBlockFixture(node.chain)
        await expect(node.chain).toAddBlock(block10)

        const { peer } = getConnectedPeer(peerNetwork.peerManager)

        const sendSpy = jest.spyOn(peer, 'send')

        const rpcId = 432
        const message = new GetBlockHeadersRequest(block2.header.sequence, 4, 7, false, rpcId)
        // The start header, block2, is the first lookup. Then we skip 7,
        // resulting in 8 lookups. Thus, the header from block10 is not included
        // since it would be the 9th lookup.
        const response = new GetBlockHeadersResponse([block2.header], rpcId)

        await peerNetwork.peerManager.onMessage.emitAsync(peer, message)

        expect(sendSpy.mock.calls[0][0]).toBeInstanceOf(GetBlockHeadersResponse)
        expectGetBlockHeadersResponseToMatch(
          sendSpy.mock.calls[0][0] as GetBlockHeadersResponse,
          response,
        )
      })
    })
  })

  describe('handles requests for block', () => {
    const nodeTest = createNodeTest()

    it('should respond to GetBlocksRequest', async () => {
      const { node, peerNetwork } = nodeTest
      const block2 = await useMinerBlockFixture(node.chain)
      await expect(node.chain).toAddBlock(block2)
      const block3 = await useMinerBlockFixture(node.chain)
      await expect(node.chain).toAddBlock(block3)
      const block4 = await useMinerBlockFixture(node.chain)
      await expect(node.chain).toAddBlock(block4)

      const { peer } = getConnectedPeer(peerNetwork.peerManager)

      const sendSpy = jest.spyOn(peer, 'send')

      const rpcId = 432
      const message = new GetBlocksRequest(block2.header.hash, 2, rpcId)
      const response = new GetBlocksResponse([block2, block3], rpcId)

      await peerNetwork.peerManager.onMessage.emitAsync(peer, message)

      expect(sendSpy.mock.calls[0][0]).toBeInstanceOf(GetBlocksResponse)
      expectGetBlocksResponseToMatch(sendSpy.mock.calls[0][0] as GetBlocksResponse, response)
    })

    it('should respect the soft max message size', async () => {
      const { node, peerNetwork } = nodeTest
      const block2 = await useMinerBlockFixture(node.chain)
      await expect(node.chain).toAddBlock(block2)
      const block3 = await useMinerBlockFixture(node.chain)
      await expect(node.chain).toAddBlock(block3)
      const block4 = await useMinerBlockFixture(node.chain)
      await expect(node.chain).toAddBlock(block4)

      const { peer } = getConnectedPeer(peerNetwork.peerManager)

      const sendSpy = jest.spyOn(peer, 'send')
      const getSizeSpy = jest.spyOn(serializer, 'getBlockSize').mockReturnValue(7 * 1024 * 1024)

      const rpcId = 432
      const message = new GetBlocksRequest(block2.header.hash, 3, rpcId)
      const response = new GetBlocksResponse([block2, block3], rpcId)

      await peerNetwork.peerManager.onMessage.emitAsync(peer, message)

      getSizeSpy.mockRestore()

      expect(sendSpy.mock.calls[0][0]).toBeInstanceOf(GetBlocksResponse)
      expectGetBlocksResponseToMatch(sendSpy.mock.calls[0][0] as GetBlocksResponse, response)
    })

    it('should respect the lookup limit', async () => {
      const { node, peerNetwork } = nodeTest

      const block2 = await useMinerBlockFixture(node.chain)
      await expect(node.chain).toAddBlock(block2)
      const block3 = await useMinerBlockFixture(node.chain)
      await expect(node.chain).toAddBlock(block3)
      const block4 = await useMinerBlockFixture(node.chain)
      await expect(node.chain).toAddBlock(block4)
      const block5 = await useMinerBlockFixture(node.chain)
      await expect(node.chain).toAddBlock(block5)
      const block6 = await useMinerBlockFixture(node.chain)
      await expect(node.chain).toAddBlock(block6)

      const { peer } = getConnectedPeer(peerNetwork.peerManager)

      const sendSpy = jest.spyOn(peer, 'send')

      const rpcId = 432
      const message = new GetBlocksRequest(block2.header.hash, 10, rpcId)
      const response = new GetBlocksResponse([block2, block3, block4, block5], rpcId)

      await peerNetwork.peerManager.onMessage.emitAsync(peer, message)

      expect(sendSpy.mock.calls[0][0]).toBeInstanceOf(GetBlocksResponse)
      expectGetBlocksResponseToMatch(sendSpy.mock.calls[0][0] as GetBlocksResponse, response)
    })
  })

  describe('when enable syncing is true', () => {
    const nodeTest = createNodeTest()

    describe('handles new blocks', () => {
      it('does not sync or gossip invalid blocks', async () => {
        const { peerNetwork, node } = nodeTest
        const { chain } = node

        const block = await useMinerBlockFixture(chain)
        const prevBlock = await chain.getBlock(block.header.previousBlockHash)
        if (prevBlock === null) {
          throw new Error('prevBlock should be in chain')
        }

        const changes: ((block: Block) => {
          block: CompactBlock
          reason: VerificationResultReason
        })[] = [
          (b: Block) => {
            const newBlock = b.toCompactBlock()
            newBlock.header.sequence = 999
            return { block: newBlock, reason: VerificationResultReason.SEQUENCE_OUT_OF_ORDER }
          },
          (b: Block) => {
            const newBlock = b.toCompactBlock()
            newBlock.header.timestamp = new Date(8640000000000000)
            return { block: newBlock, reason: VerificationResultReason.TOO_FAR_IN_FUTURE }
          },
        ]

        for (const change of changes) {
          const { block: invalidBlock, reason } = change(block)

          const peers = getConnectedPeersWithSpies(peerNetwork.peerManager, 1)
          await peerNetwork.peerManager.onMessage.emitAsync(
            ...peerMessage(peers[0].peer, new NewCompactBlockMessage(invalidBlock)),
          )

          // Peers should not be sent invalid block
          for (const { sendSpy } of peers) {
            expect(sendSpy).not.toHaveBeenCalled()
          }

          const invalidHeader = nodeTest.chain.newBlockHeaderFromRaw(invalidBlock.header)
          await expect(chain.hasBlock(invalidHeader.hash)).resolves.toBe(false)
          expect(chain.isInvalid(invalidHeader)).toBe(reason)
        }
      })

      it('broadcasts a new block when it is created', async () => {
        const { peerNetwork, node, chain } = nodeTest

        const block = await useMinerBlockFixture(chain)

        // Create 10 peers on the current version
        const peers = getConnectedPeersWithSpies(peerNetwork.peerManager, 10)
        for (const { peer } of peers) {
          peer.version = VERSION_PROTOCOL
        }

        await node.miningManager.onNewBlock.emitAsync(block)

        const sentHash = peers.filter(({ sendSpy }) => {
          return (
            sendSpy.mock.calls.filter(([message]) => {
              return message instanceof NewBlockHashesMessage
            }).length > 0
          )
        })

        const sentNewCompactBlock = peers.filter(({ sendSpy }) => {
          const hashCalls = sendSpy.mock.calls.filter(([message]) => {
            return message instanceof NewCompactBlockMessage
          })
          return hashCalls.length > 0
        })

        expect(sentHash.length).toBe(7)
        expect(sentNewCompactBlock.length).toBe(3)
      })
    })

    describe('handles requests for mempool transactions', () => {
      it('should respond to PooledTransactionsRequest', async () => {
        const { peerNetwork, node } = nodeTest

        const { wallet, memPool } = node
        const accountA = await useAccountFixture(wallet, 'accountA')
        const accountB = await useAccountFixture(wallet, 'accountB')
        const { transaction } = await useBlockWithTx(node, accountA, accountB)
        memPool.acceptTransaction(transaction)

        const { peer, sendSpy } = getConnectedPeersWithSpies(peerNetwork.peerManager, 1)[0]

        const rpcId = 432
        const message = new PooledTransactionsRequest([transaction.hash()], rpcId)
        const response = new PooledTransactionsResponse([transaction], rpcId)

        peerNetwork.peerManager.onMessage.emit(peer, message)

        expect(sendSpy).toHaveBeenCalledWith(response)
      })
    })

    describe('handles new transactions', () => {
      it('does not accept or sync transactions when the worker pool is saturated', async () => {
        const { peerNetwork, workerPool, wallet, node } = nodeTest
        const { memPool } = node

        const accountA = await useAccountFixture(wallet, 'accountA')
        const accountB = await useAccountFixture(wallet, 'accountB')
        const { transaction } = await useBlockWithTx(node, accountA, accountB)

        Object.defineProperty(workerPool, 'saturated', { get: () => true })

        const addPendingTransaction = jest.spyOn(wallet, 'addPendingTransaction')

        const peers = getConnectedPeersWithSpies(peerNetwork.peerManager, 5)
        const { peer: peerWithTransaction } = peers[0]

        await peerNetwork.peerManager.onMessage.emitAsync(
          peerWithTransaction,
          new NewTransactionsMessage([transaction]),
        )

        for (const { sendSpy } of peers) {
          expect(sendSpy).not.toHaveBeenCalled()
        }

        expect(memPool.exists(transaction.hash())).toBe(false)
        expect(addPendingTransaction).not.toHaveBeenCalled()
      })

      it('does not accept or sync transactions when the node is syncing', async () => {
        const { peerNetwork, node } = nodeTest

        const { wallet, memPool, chain } = node
        const accountA = await useAccountFixture(wallet, 'accountA')
        const accountB = await useAccountFixture(wallet, 'accountB')
        const { transaction } = await useBlockWithTx(node, accountA, accountB)

        chain.synced = false

        const addPendingTransaction = jest.spyOn(wallet, 'addPendingTransaction')

        const peers = getConnectedPeersWithSpies(peerNetwork.peerManager, 5)
        const { peer: peerWithTransaction } = peers[0]

        await peerNetwork.peerManager.onMessage.emitAsync(
          peerWithTransaction,
          new NewTransactionsMessage([transaction]),
        )

        for (const { sendSpy } of peers) {
          expect(sendSpy).not.toHaveBeenCalled()
        }

        expect(memPool.exists(transaction.hash())).toBe(false)
        expect(addPendingTransaction).not.toHaveBeenCalled()
      })

      it('verifies and syncs the same transaction once', async () => {
        const { peerNetwork, node } = nodeTest
        const { wallet, memPool, chain } = node

        chain.synced = true
        const accountA = await useAccountFixture(wallet, 'accountA')
        const accountB = await useAccountFixture(wallet, 'accountB')
        const { transaction } = await useBlockWithTx(node, accountA, accountB)

        const verifyNewTransactionSpy = jest.spyOn(node.chain.verifier, 'verifyNewTransaction')

        const peers = getConnectedPeersWithSpies(peerNetwork.peerManager, 5)
        const { peer: peerWithTransaction } = peers[0]
        const peersWithoutTransaction = peers.slice(1)

        // Don't sync incoming transactions to wallet since its done async and will
        // attempt to update the wallet after the test has finished
        peerNetwork.onTransactionGossipReceived.clear()
        const onTransactionGossipReceivedSpy =
          jest.fn<(transaction: Transaction, valid: boolean) => void>()
        peerNetwork.onTransactionGossipReceived.on(onTransactionGossipReceivedSpy)

        await peerNetwork.peerManager.onMessage.emitAsync(
          peerWithTransaction,
          new NewTransactionsMessage([transaction]),
        )

        for (const { sendSpy } of peersWithoutTransaction) {
          const transactionMessages = sendSpy.mock.calls.filter(([message]) => {
            return (
              message instanceof NewTransactionsMessage ||
              message instanceof NewPooledTransactionHashes
            )
          })
          expect(transactionMessages).toHaveLength(1)
        }

        expect(verifyNewTransactionSpy).toHaveBeenCalledTimes(1)

        expect(memPool.get(transaction.hash())).toBeDefined()

        expect(onTransactionGossipReceivedSpy).toHaveBeenCalledTimes(1)

        for (const { peer } of peers) {
          expect(peer.state.identity).not.toBeNull()
          peer.state.identity &&
            expect(peerNetwork.knowsTransaction(transaction.hash(), peer.state.identity)).toBe(
              true,
            )
        }

        const { peer: peerWithTransaction2 } = peers[1]
        await peerNetwork.peerManager.onMessage.emitAsync(
          peerWithTransaction2,
          new NewTransactionsMessage([transaction]),
        )

        // These functions should still only be called once
        for (const { sendSpy } of peersWithoutTransaction) {
          const transactionMessages = sendSpy.mock.calls.filter(([message]) => {
            return (
              message instanceof NewTransactionsMessage ||
              message instanceof NewPooledTransactionHashes
            )
          })
          expect(transactionMessages).toHaveLength(1)
        }

        expect(verifyNewTransactionSpy).toHaveBeenCalledTimes(1)

        expect(memPool.get(transaction.hash())).toBeDefined()

        expect(onTransactionGossipReceivedSpy).toHaveBeenCalledTimes(1)
      })

      it('does not sync or gossip double-spent transactions', async () => {
        const { peerNetwork, node } = nodeTest
        const { wallet, memPool, chain } = node

        chain.synced = true

        const accountA = await useAccountFixture(wallet, 'accountA')
        const accountB = await useAccountFixture(wallet, 'accountB')
        const { block, transaction } = await useBlockWithTx(node, accountA, accountB)
        const verifyNewTransactionSpy = jest.spyOn(node.chain.verifier, 'verifyNewTransaction')

        await node.chain.nullifiers.connectBlock(block)

        const acceptTransaction = jest.spyOn(node.memPool, 'acceptTransaction')
        const addPendingTransaction = jest.spyOn(node.wallet, 'addPendingTransaction')

        const peers = getConnectedPeersWithSpies(peerNetwork.peerManager, 5)
        const { peer: peerWithTransaction } = peers[0]
        const peersWithoutTransaction = peers.slice(1)

        await peerNetwork.peerManager.onMessage.emitAsync(
          peerWithTransaction,
          new NewTransactionsMessage([transaction]),
        )

        // Peers should not be sent invalid transaction
        for (const { sendSpy } of peers) {
          expect(sendSpy).not.toHaveBeenCalled()
        }

        expect(verifyNewTransactionSpy).toHaveBeenCalledTimes(1)
        const verificationResult = await verifyNewTransactionSpy.mock.results[0].value
        expect(verificationResult).toEqual({
          valid: false,
          reason: VerificationResultReason.DOUBLE_SPEND,
        })

        expect(memPool.exists(transaction.hash())).toBe(false)
        expect(acceptTransaction).not.toHaveBeenCalled()

        expect(addPendingTransaction).not.toHaveBeenCalled()

        // Peer that were not sent transaction should not be marked
        for (const { peer } of peersWithoutTransaction) {
          expect(peer.state.identity).not.toBeNull()
          peer.state.identity &&
            expect(peerNetwork.knowsTransaction(transaction.hash(), peer.state.identity)).toBe(
              false,
            )
        }

        // Peer that sent the transaction should have it marked
        expect(peerWithTransaction.state.identity).not.toBeNull()
        peerWithTransaction.state.identity &&
          expect(
            peerNetwork.knowsTransaction(
              transaction.hash(),
              peerWithTransaction.state.identity,
            ),
          ).toBe(true)
      })

      it('does not sync or gossip internally-double-spent transactions', async () => {
        const { peerNetwork, node } = nodeTest
        const { wallet, memPool, chain } = node

        chain.synced = true

        const accountA = await useAccountFixture(wallet, 'accountA')
        const { block, transaction } = await useBlockWithTx(
          node,
          accountA,
          accountA,
          true,
          undefined,
        )
        await expect(chain).toAddBlock(block)
        await wallet.scan()

        const note = transaction.getNote(1).decryptNoteForOwner(accountA.incomingViewKey)
        Assert.isNotUndefined(note)
        const noteHash = note.hash()

        const tx = await useTxFixture(wallet, accountA, accountA, async () => {
          const raw = await wallet.createTransaction({
            account: accountA,
            notes: [noteHash, noteHash],
            fee: 0n,
          })
          return await wallet.workerPool.postTransaction(raw, accountA.spendingKey)
        })

        const verifyNewTransactionSpy = jest.spyOn(node.chain.verifier, 'verifyNewTransaction')

        const acceptTransaction = jest.spyOn(node.memPool, 'acceptTransaction')
        const addPendingTransaction = jest.spyOn(node.wallet, 'addPendingTransaction')

        const peers = getConnectedPeersWithSpies(peerNetwork.peerManager, 5)
        const { peer: peerWithTransaction } = peers[0]
        const peersWithoutTransaction = peers.slice(1)

        await peerNetwork.peerManager.onMessage.emitAsync(
          peerWithTransaction,
          new NewTransactionsMessage([tx]),
        )

        // Peers should not be sent invalid transaction
        for (const { sendSpy } of peers) {
          expect(sendSpy).not.toHaveBeenCalled()
        }

        expect(verifyNewTransactionSpy).toHaveBeenCalledTimes(1)
        const verificationResult = await verifyNewTransactionSpy.mock.results[0].value
        expect(verificationResult).toEqual({
          valid: false,
          reason: VerificationResultReason.DOUBLE_SPEND,
        })

        expect(memPool.exists(tx.hash())).toBe(false)
        expect(acceptTransaction).not.toHaveBeenCalled()

        expect(addPendingTransaction).not.toHaveBeenCalled()

        // Peer that were not sent transaction should not be marked
        for (const { peer } of peersWithoutTransaction) {
          expect(peer.state.identity).not.toBeNull()
          peer.state.identity &&
            expect(peerNetwork.knowsTransaction(tx.hash(), peer.state.identity)).toBe(false)
        }

        // Peer that sent the transaction should have it marked
        expect(peerWithTransaction.state.identity).not.toBeNull()
        peerWithTransaction.state.identity &&
          expect(
            peerNetwork.knowsTransaction(tx.hash(), peerWithTransaction.state.identity),
          ).toBe(true)
      })

      it('cancels request for transactions if the transaction is added to a block', async () => {
        const { peerNetwork, node } = nodeTest
        const { wallet, chain } = node

        chain.synced = true

        const accountA = await useAccountFixture(wallet, 'accountA')
        const accountB = await useAccountFixture(wallet, 'accountB')
        const { block, transaction } = await useBlockWithTx(node, accountA, accountB)

        const [{ peer, sendSpy }] = getConnectedPeersWithSpies(peerNetwork.peerManager, 1)

        const fetcherHashReceived = jest.spyOn(
          peerNetwork['transactionFetcher'],
          'hashReceived',
        )

        const fetcherHashRemoved = jest.spyOn(
          peerNetwork['transactionFetcher'],
          'removeTransaction',
        )

        await peerNetwork.peerManager.onMessage.emitAsync(
          peer,
          new NewPooledTransactionHashes([transaction.hash()]),
        )

        expect(fetcherHashReceived).toHaveBeenCalledTimes(1)
        expect(fetcherHashReceived).toHaveBeenCalledWith(transaction.hash(), expect.any(Peer))

        expect(sendSpy).not.toHaveBeenCalled()

        // Should be removed from the fetcher here
        await expect(chain).toAddBlock(block)

        expect(fetcherHashRemoved).toHaveBeenCalledTimes(block.transactions.length)
        expect(fetcherHashRemoved).toHaveBeenNthCalledWith(
          block.transactions.findIndex((t) => t.hash().equals(transaction.hash())) + 1,
          transaction.hash(),
        )

        // We wait 500ms and then send the request for the transaction to a random peer
        jest.runOnlyPendingTimers()

        expect(sendSpy).not.toHaveBeenCalled()
      })

      it('syncs transactions if the spends reference a larger tree size', async () => {
        const { peerNetwork, node } = nodeTest
        const { wallet, memPool, chain } = node

        chain.synced = true

        const accountA = await useAccountFixture(wallet, 'accountA')
        const accountB = await useAccountFixture(wallet, 'accountB')

        const block1 = await useMinerBlockFixture(node.chain, undefined, accountA, node.wallet)
        await expect(chain).toAddBlock(block1)

        const { transaction } = await useBlockWithTx(node, accountA, accountB)

        // Remove the two blocks so that chain has a smaller tree size than transaction
        await chain.removeBlock(chain.head.hash)
        await chain.removeBlock(chain.head.hash)

        const verifyNewTransactionSpy = jest.spyOn(node.chain.verifier, 'verifyNewTransaction')

        const peers = getConnectedPeersWithSpies(peerNetwork.peerManager, 5)
        const { peer: peerWithTransaction } = peers[0]
        const peersWithoutTransaction = peers.slice(1)

        // Don't sync incoming transactions to wallet since its done async and will
        // attempt to update the wallet after the test has finished
        peerNetwork.onTransactionGossipReceived.clear()
        const onTransactionGossipReceivedSpy =
          jest.fn<(transaction: Transaction, valid: boolean) => void>()
        peerNetwork.onTransactionGossipReceived.on(onTransactionGossipReceivedSpy)

        await peerNetwork.peerManager.onMessage.emitAsync(
          peerWithTransaction,
          new NewTransactionsMessage([transaction]),
        )

        expect(verifyNewTransactionSpy).toHaveBeenCalledTimes(1)
        const verificationResult = await verifyNewTransactionSpy.mock.results[0].value
        expect(verificationResult).toEqual({
          valid: true,
        })

        expect(memPool.get(transaction.hash())).toBeDefined()
        expect(onTransactionGossipReceivedSpy).toHaveBeenCalledTimes(1)
        for (const { sendSpy } of peersWithoutTransaction) {
          const transactionMessages = sendSpy.mock.calls.filter(([message]) => {
            return (
              message instanceof NewTransactionsMessage ||
              message instanceof NewPooledTransactionHashes
            )
          })
          expect(transactionMessages).toHaveLength(1)
        }
      })

      it('does not sync or gossip invalid transactions', async () => {
        const { peerNetwork, node } = nodeTest
        const { wallet, memPool, chain } = node

        chain.synced = true

        const accountA = await useAccountFixture(wallet, 'accountA')
        const accountB = await useAccountFixture(wallet, 'accountB')
        const fixture = await useBlockWithTx(node, accountA, accountB)

        const transactionBuffer = Buffer.from(fixture.transaction.serialize())
        // make the transaction invalid somehow
        transactionBuffer.writeUInt8(0xff, transactionBuffer.byteLength - 2)
        const transaction = new Transaction(transactionBuffer)

        const verifyNewTransactionSpy = jest.spyOn(node.chain.verifier, 'verifyNewTransaction')

        const acceptTransaction = jest.spyOn(node.memPool, 'acceptTransaction')
        const addPendingTransaction = jest.spyOn(node.wallet, 'addPendingTransaction')

        const peers = getConnectedPeersWithSpies(peerNetwork.peerManager, 5)
        const { peer: peerWithTransaction } = peers[0]
        const peersWithoutTransaction = peers.slice(1)

        await peerNetwork.peerManager.onMessage.emitAsync(
          peerWithTransaction,
          new NewTransactionsMessage([transaction]),
        )

        // Peers should not be sent invalid transaction
        for (const { sendSpy } of peers) {
          expect(sendSpy).not.toHaveBeenCalled()
        }

        expect(verifyNewTransactionSpy).toHaveBeenCalledTimes(1)
        const verificationResult = await verifyNewTransactionSpy.mock.results[0].value
        expect(verificationResult).toEqual({
          valid: false,
          reason: VerificationResultReason.ERROR,
        })

        expect(memPool.exists(transaction.hash())).toBe(false)
        expect(acceptTransaction).not.toHaveBeenCalled()

        expect(addPendingTransaction).not.toHaveBeenCalled()

        // Peer that were not sent transaction should not be marked
        for (const { peer } of peersWithoutTransaction) {
          expect(peer.state.identity).not.toBeNull()
          peer.state.identity &&
            expect(peerNetwork.knowsTransaction(transaction.hash(), peer.state.identity)).toBe(
              false,
            )
        }

        // Peer that sent the transaction should have it marked
        expect(peerWithTransaction.state.identity).not.toBeNull()
        peerWithTransaction.state.identity &&
          expect(
            peerNetwork.knowsTransaction(
              transaction.hash(),
              peerWithTransaction.state.identity,
            ),
          ).toBe(true)
      })

      it('broadcasts a new transaction when it is created', async () => {
        const { peerNetwork, node, wallet } = nodeTest

        // Create 10 peers on the current version
        const peers = getConnectedPeersWithSpies(peerNetwork.peerManager, 10)
        for (const { peer } of peers) {
          peer.version = VERSION_PROTOCOL
        }

        jest.spyOn(peerNetwork, 'isReady', 'get').mockReturnValue(true)

        const accountA = await useAccountFixture(wallet, 'accountA')
        const accountB = await useAccountFixture(wallet, 'accountB')
        const { transaction } = await useBlockWithTx(node, accountA, accountB)

        await wallet.broadcastTransaction(transaction)

        const sentHash = peers.filter(({ sendSpy }) => {
          return (
            sendSpy.mock.calls.filter(([message]) => {
              return message instanceof NewPooledTransactionHashes
            }).length > 0
          )
        })

        const sentFullTransaction = peers.filter(({ sendSpy }) => {
          const hashCalls = sendSpy.mock.calls.filter(([message]) => {
            return message instanceof NewTransactionsMessage
          })
          return hashCalls.length > 0
        })

        expect(sentHash.length).toBe(7)
        expect(sentFullTransaction.length).toBe(3)
      })
    })
  })

  describe('when enable syncing is false', () => {
    const nodeTest = createNodeTest(false, { config: { enableSyncing: false } })

    it('does not handle blocks', async () => {
      const { peerNetwork, node, chain } = nodeTest
      chain.synced = false

      const block = await useMinerBlockFixture(chain)

      const { peer } = getConnectedPeer(peerNetwork.peerManager)

      const message = new NewCompactBlockMessage(block.toCompactBlock())

      jest.spyOn(node.syncer, 'addBlock')

      await peerNetwork.peerManager.onMessage.emitAsync(...peerMessage(peer, message))

      expect(node.syncer.addBlock).not.toHaveBeenCalled()
    })

    it('does not handle transactions', async () => {
      const { peerNetwork, node, chain } = nodeTest
      chain.synced = false

      const { wallet, memPool } = node
      const accountA = await useAccountFixture(wallet, 'accountA')
      const accountB = await useAccountFixture(wallet, 'accountB')
      const { transaction } = await useBlockWithTx(node, accountA, accountB)

      const peers = getConnectedPeersWithSpies(peerNetwork.peerManager, 2)

      const { sendSpy } = peers[0] // peer without transaction
      const { peer: peerWithTransaction } = peers[1]

      jest.spyOn(chain.verifier, 'verifyNewTransaction')
      jest.spyOn(memPool, 'acceptTransaction')

      await peerNetwork.peerManager.onMessage.emitAsync(
        peerWithTransaction,
        new NewTransactionsMessage([transaction]),
      )

      expect(sendSpy).not.toHaveBeenCalled()
      expect(chain.verifier.verifyNewTransaction).not.toHaveBeenCalled()
      expect(memPool.acceptTransaction).not.toHaveBeenCalled()
    })
  })
})
