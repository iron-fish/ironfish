/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

jest.mock('ws')

import type WSWebSocket from 'ws'
import http from 'http'
import net from 'net'
import ws from 'ws'
import { Assert } from '../assert'
import { mockChain, mockNode, mockStrategy } from '../testUtilities/mocks'
import { DisconnectingMessage } from './messages/disconnecting'
import { NetworkMessageType } from './messages/networkMessage'
import { NewBlockMessage } from './messages/newBlock'
import { NewTransactionMessage } from './messages/newTransaction'
import { PeerNetwork, RoutingStyle } from './peerNetwork'
import { getConnectedPeer, mockHostsStore, mockPrivateIdentity } from './testUtilities'

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

  describe('registerHandler', () => {
    it('stores the type in the routingStyles', async () => {
      const peerNetwork = new PeerNetwork({
        identity: mockPrivateIdentity('local'),
        agent: 'sdk/1/cli',
        webSocket: ws,
        node: mockNode(),
        chain: mockChain(),
        strategy: mockStrategy(),
        hostsStore: mockHostsStore(),
      })

      const type = 'hello'
      peerNetwork.registerHandler(
        type,
        RoutingStyle.gossip,
        (p) => Promise.resolve(p),
        () => {},
      )
      expect(peerNetwork['routingStyles'].get(type)).toBe(RoutingStyle.gossip)
      await peerNetwork.stop()
    })
  })

  describe('when validation fails', () => {
    it('ignores a message', async () => {
      const peerNetwork = new PeerNetwork({
        identity: mockPrivateIdentity('local'),
        agent: 'sdk/1/cli',
        webSocket: ws,
        node: mockNode(),
        chain: mockChain(),
        strategy: mockStrategy(),
        hostsStore: mockHostsStore(),
      })

      const handlerMock = jest.fn(() => {})
      peerNetwork.registerHandler(
        'hello',
        RoutingStyle.gossip,
        () => Promise.reject(new Error('invalid message')),
        handlerMock,
      )

      const { peer } = getConnectedPeer(peerNetwork.peerManager)
      const message = { type: 'hello', nonce: 'test_handler1', payload: { test: 'Payload' } }
      await peerNetwork['handleMessage'](peer, {
        peerIdentity: peer.getIdentityOrThrow(),
        message,
      })
      expect(handlerMock).not.toBeCalled()
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

      const newBlockHandler = peerNetwork['gossipRouter']['_handlers'].get(
        NetworkMessageType.NewBlock,
      )
      Assert.isNotUndefined(newBlockHandler)

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
          randomness: 1,
          sequence: 2,
          target: 'icecream',
          timestamp: 200000,
          work: '123',
          hash: 'ramen',
        },
        transactions: [],
      }
      await newBlockHandler({
        peerIdentity: peer.getIdentityOrThrow(),
        message: new NewBlockMessage(block, 'nonce'),
      })

      expect(peerNetwork['node']['syncer'].addNewBlock).toHaveBeenCalledWith(peer, block)
    })

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

        const newTransactionHandler = peerNetwork['gossipRouter']['_handlers'].get(
          NetworkMessageType.NewTransaction,
        )

        if (newTransactionHandler === undefined) {
          throw new Error('Expected newTransactionHandler to be defined')
        }

        await newTransactionHandler({
          peerIdentity: '',
          message: new NewTransactionMessage(Buffer.from(''), 'nonce'),
        })

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

        const newTransactionHandler = peerNetwork['gossipRouter']['_handlers'].get(
          NetworkMessageType.NewTransaction,
        )

        if (newTransactionHandler === undefined) {
          throw new Error('Expected newTransactionHandler to be defined')
        }

        await newTransactionHandler({
          peerIdentity: '',
          message: new NewTransactionMessage(Buffer.from(''), 'nonce'),
        })

        expect(acceptTransaction).not.toHaveBeenCalled()
        expect(syncTransaction).not.toHaveBeenCalled()
      })
    })

    describe('when the worker pool is not saturated', () => {
      it('verifies transactions', async () => {
        const chain = {
          ...mockChain(),
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

        // Spy on new transactions
        const verifyNewTransactionSpy = jest.spyOn(
          peerNetwork['chain']['verifier'],
          'verifyNewTransaction',
        )

        const newTransactionHandler = peerNetwork['gossipRouter']['_handlers'].get(
          NetworkMessageType.NewTransaction,
        )

        if (newTransactionHandler === undefined) {
          throw new Error('Expected newTransactionHandler to be defined')
        }

        await newTransactionHandler({
          peerIdentity: '',
          message: new NewTransactionMessage(Buffer.from(''), 'nonce'),
        })

        expect(verifyNewTransactionSpy).toHaveBeenCalled()
      })
    })
  })

  describe('when enable syncing is false', () => {
    it('does not handle blocks', () => {
      // We have to create 2 peerNetworks because this test tests logic in the
      // constructor itself and I found that this test would pass because the
      // tested function was deleted. Now it ensures it does get called under
      // the same conditions.

      const networkArgs = {
        identity: mockPrivateIdentity('local'),
        agent: 'sdk/1/cli',
        webSocket: ws,
        node: mockNode(),
        chain: mockChain(),
        strategy: mockStrategy(),
        hostsStore: mockHostsStore(),
      }

      const peerNetwork = new PeerNetwork({ ...networkArgs, enableSyncing: false })
      const newBlockHandler = peerNetwork['gossipRouter']['_handlers'].get(
        NetworkMessageType.NewBlock,
      )
      expect(newBlockHandler).toBeUndefined()
    })

    it('does not handle transactions', () => {
      // We have to create 2 peerNetworks because this test tests logic in the
      // constructor itself and I found that this test would pass because the
      // tested function was deleted. Now it ensures it does get called under
      // the same conditions.

      const networkArgs = {
        identity: mockPrivateIdentity('local'),
        agent: 'sdk/1/cli',
        webSocket: ws,
        node: mockNode(),
        chain: mockChain(),
        strategy: mockStrategy(),
        hostsStore: mockHostsStore(),
      }

      const peerNetwork = new PeerNetwork({ ...networkArgs, enableSyncing: false })
      const newTransactionHandler = peerNetwork['gossipRouter']['_handlers'].get(
        NetworkMessageType.NewTransaction,
      )
      expect(newTransactionHandler).toBeUndefined()
    })
  })
})
