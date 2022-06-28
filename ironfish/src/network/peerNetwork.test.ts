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
import {
  mockChain,
  mockNode,
  mockStrategy,
  mockTransaction,
  mockWorkerPool,
} from '../testUtilities/mocks'
import { DisconnectingMessage } from './messages/disconnecting'
import { NewBlockMessage } from './messages/newBlock'
import { NewTransactionMessage } from './messages/newTransaction'
import { PeerListMessage } from './messages/peerList'
import { PeerNetwork } from './peerNetwork'
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

    describe('handles new transactions', () => {
      describe('when the worker pool is saturated', () => {
        it('does not accept or sync transactions', async () => {
          const node = mockNode()
          const peerNetwork = new PeerNetwork({
            identity: mockPrivateIdentity('local'),
            agent: 'sdk/1/cli',
            webSocket: ws,
            node,
            chain: {
              ...mockChain(),
              verifier: {
                verifyNewTransaction: jest.fn(),
              },
            },
            strategy: mockStrategy(),
            hostsStore: mockHostsStore(),
          })

          const { accounts, memPool, workerPool } = node
          jest.spyOn(workerPool, 'saturated').mockImplementationOnce(() => false)
          const acceptTransaction = jest.spyOn(memPool, 'acceptTransaction')
          const syncTransaction = jest.spyOn(accounts, 'syncTransaction')

          const gossip = await peerNetwork['onNewTransaction']({
            peerIdentity: '',
            message: new NewTransactionMessage(Buffer.from(''), Buffer.alloc(16, 'nonce')),
          })

          expect(gossip).toBe(false)
          expect(acceptTransaction).not.toHaveBeenCalled()
          expect(syncTransaction).not.toHaveBeenCalled()
        })
      })

      describe('when the node is syncing', () => {
        it('does not accept or sync transactions', async () => {
          const chain = {
            ...mockChain(),
            synced: false,
            verifier: {
              verifyNewTransaction: jest.fn(),
            },
          }
          const node = {
            ...mockNode(),
            chain,
          }
          const peerNetwork = new PeerNetwork({
            identity: mockPrivateIdentity('local'),
            agent: 'sdk/1/cli',
            webSocket: ws,
            node,
            chain,
            strategy: mockStrategy(),
            hostsStore: mockHostsStore(),
          })

          const { accounts, memPool } = node
          const acceptTransaction = jest.spyOn(memPool, 'acceptTransaction')
          const syncTransaction = jest.spyOn(accounts, 'syncTransaction')

          const gossip = await peerNetwork['onNewTransaction']({
            peerIdentity: '',
            message: new NewTransactionMessage(Buffer.from(''), Buffer.alloc(16, 'nonce')),
          })

          expect(gossip).toBe(false)
          expect(acceptTransaction).not.toHaveBeenCalled()
          expect(syncTransaction).not.toHaveBeenCalled()
        })
      })

      describe('accepts new transactions', () => {
        it('verifies and syncs transactions', async () => {
          const chain = mockChain()
          const workerPool = {
            ...mockWorkerPool,
            saturated: false,
          }
          const node = {
            ...mockNode(),
            chain,
            workerPool,
          }

          const peerNetwork = new PeerNetwork({
            identity: mockPrivateIdentity('local'),
            agent: 'sdk/1/cli',
            webSocket: ws,
            node,
            chain,
            strategy: mockStrategy(),
            hostsStore: mockHostsStore(),
          })

          // Spy on new transactions
          const verifyNewTransactionSpy = jest
            .spyOn(node.chain.verifier, 'verifyNewTransaction')
            .mockReturnValue(mockTransaction())

          const verifyTransactionContextual = jest
            .spyOn(node.chain.verifier, 'verifyTransactionNoncontextual')
            .mockReturnValue({ valid: true })

          expect(node.workerPool.saturated).toEqual(false)

          const message = {
            peerIdentity: '',
            message: new NewTransactionMessage(Buffer.from(''), Buffer.alloc(16, 'nonce')),
          }

          const exists = jest.spyOn(node.memPool, 'exists').mockReturnValue(false)
          const acceptTransaction = jest
            .spyOn(node.memPool, 'acceptTransaction')
            .mockReturnValueOnce(true)
          const syncTransaction = jest.spyOn(node.accounts, 'syncTransaction')

          let gossip = await peerNetwork['onNewTransaction'](message)
          expect(gossip).toBe(true)
          expect(verifyNewTransactionSpy).toHaveBeenCalledTimes(1)
          expect(verifyTransactionContextual).toHaveBeenCalledTimes(1)
          expect(acceptTransaction).toHaveBeenCalledTimes(1)
          expect(syncTransaction).toHaveBeenCalledTimes(1)

          acceptTransaction.mockReturnValueOnce(false)

          gossip = await peerNetwork['onNewTransaction'](message)
          expect(gossip).toBe(false)
          expect(verifyNewTransactionSpy).toHaveBeenCalledTimes(2)
          expect(verifyTransactionContextual).toHaveBeenCalledTimes(2)
          expect(acceptTransaction).toHaveBeenCalledTimes(2)
          expect(syncTransaction).toHaveBeenCalledTimes(2)

          exists.mockReturnValueOnce(true)

          gossip = await peerNetwork['onNewTransaction'](message)
          expect(gossip).toBe(true)
          expect(verifyNewTransactionSpy).toHaveBeenCalledTimes(3)
          expect(verifyTransactionContextual).toHaveBeenCalledTimes(3)
          expect(acceptTransaction).toHaveBeenCalledTimes(2)
          expect(syncTransaction).toHaveBeenCalledTimes(3)

          verifyTransactionContextual.mockReturnValue({ valid: false, reason: 'foo' })

          gossip = await peerNetwork['onNewTransaction'](message)
          expect(gossip).toBe(false)
          expect(verifyNewTransactionSpy).toHaveBeenCalledTimes(4)
          expect(verifyTransactionContextual).toHaveBeenCalledTimes(4)
          expect(acceptTransaction).toHaveBeenCalledTimes(2)
          expect(syncTransaction).toHaveBeenCalledTimes(3)
        })
      })
    })
  })

  describe('when enable syncing is false', () => {
    it('does not handle blocks', async () => {
      const peerNetwork = new PeerNetwork({
        identity: mockPrivateIdentity('local'),
        agent: 'sdk/1/cli',
        webSocket: ws,
        node: mockNode(),
        chain: mockChain(),
        strategy: mockStrategy(),
        hostsStore: mockHostsStore(),
        enableSyncing: false,
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

      const peerIdentity = peer.getIdentityOrThrow()
      const gossip = await peerNetwork['onNewBlock']({
        peerIdentity,
        message: new NewBlockMessage(block, Buffer.alloc(16, 'nonce')),
      })
      expect(gossip).toBe(false)
      expect(peerNetwork['node']['syncer'].addNewBlock).not.toHaveBeenCalled()
    })

    it('does not handle transactions', async () => {
      const peerNetwork = new PeerNetwork({
        identity: mockPrivateIdentity('local'),
        agent: 'sdk/1/cli',
        webSocket: ws,
        node: mockNode(),
        chain: mockChain(),
        strategy: mockStrategy(),
        hostsStore: mockHostsStore(),
        enableSyncing: false,
      })
      const { peer } = getConnectedPeer(peerNetwork.peerManager)

      const peerIdentity = peer.getIdentityOrThrow()
      const gossip = await peerNetwork['onNewTransaction']({
        peerIdentity,
        message: new NewTransactionMessage(Buffer.from(''), Buffer.alloc(16, 'nonce')),
      })
      expect(gossip).toBe(false)
      expect(peerNetwork['chain']['verifier'].verifyNewTransaction).not.toHaveBeenCalled()
    })
  })
})
