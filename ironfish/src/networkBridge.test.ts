/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { NodeMessageType } from './network/messages'
import { CannotSatisfyRequestError, Gossip, IncomingPeerMessage, PeerNetwork } from './network'
import { IronfishSdk } from './sdk'
import { makeDbName } from './captain/testUtilities'
import { getConnectedPeer, mockPrivateIdentity } from './network/testUtilities'
import { StringUtils } from './utils'

jest.mock('ws')

describe('Node requests a block from other nodes', () => {
  it('calls error handler if the message is formatted wrong', async () => {
    const dataDir = `./testdbs/${makeDbName()}`

    const sdk = await IronfishSdk.init({
      dataDir: dataDir,
    })

    const node = await sdk.node()

    const peerNetwork = new PeerNetwork(mockPrivateIdentity(''), 'sdk/1/cli', require('ws'))
    const { peer } = getConnectedPeer(peerNetwork.peerManager)

    const request = jest.spyOn(peerNetwork, 'request').mockImplementation(() => {
      return Promise.resolve({
        peerIdentity: peer.getIdentityOrThrow(),
        message: {
          type: NodeMessageType.Blocks,
          payload: { block: { this_is: 'NOT A BLOCK' } },
        },
      })
    })
    const handleBlockRequestError = jest.spyOn(
      node.captain.blockSyncer,
      'handleBlockRequestError',
    )
    node.networkBridge.attachPeerNetwork(peerNetwork)

    node.captain.requestBlocks(Buffer.from(StringUtils.hash('blockyoudonthave')), true)
    expect(request).toBeCalled()
    // Wait for the promises to finish up
    await new Promise<void>((resolve) => setImmediate(() => resolve()))
    expect(handleBlockRequestError).toBeCalled()

    peerNetwork.stop()
    await node.shutdown()
  })

  it('calls error handler if the request promise rejects', async () => {
    const dataDir = `./testdbs/${makeDbName()}`

    const sdk = await IronfishSdk.init({
      dataDir: dataDir,
    })

    const node = await sdk.node()

    const peerNetwork = new PeerNetwork(mockPrivateIdentity(''), 'sdk/1/cli', require('ws'))
    const request = jest.spyOn(peerNetwork, 'request').mockImplementation(() => {
      return Promise.reject(new CannotSatisfyRequestError('bad request'))
    })
    const handleBlockRequestError = jest.spyOn(
      node.captain.blockSyncer,
      'handleBlockRequestError',
    )
    node.networkBridge.attachPeerNetwork(peerNetwork)

    node.captain.requestBlocks(Buffer.from(StringUtils.hash('blockyoudonthave')), true)
    expect(request).toBeCalled()
    // Wait for the promises to finish up
    await new Promise<void>((resolve) => setImmediate(() => resolve()))
    expect(handleBlockRequestError).toBeCalled()

    peerNetwork.stop()
    await node.shutdown()
  })
})

describe('Node receives a proposed transaction from another node', () => {
  it('discards the transaction if it does not verify', async () => {
    const dataDir = `./testdbs/${makeDbName()}`

    const sdk = await IronfishSdk.init({
      dataDir: dataDir,
    })

    const node = await sdk.node()

    const peerNetwork = new PeerNetwork(mockPrivateIdentity(''), 'sdk/1/cli', require('ws'))
    const { peer } = getConnectedPeer(peerNetwork.peerManager)

    const acceptTransaction = jest.spyOn(node.memPool, 'acceptTransaction')
    const verifyNewTransaction = jest.spyOn(node.captain.chain.verifier, 'verifyNewTransaction')
    node.networkBridge.attachPeerNetwork(peerNetwork)

    const message: IncomingPeerMessage<
      Gossip<NodeMessageType.NewTransaction, { transaction: Buffer }>
    > = {
      peerIdentity: peer.getIdentityOrThrow(),
      message: {
        type: NodeMessageType.NewTransaction,
        nonce: 'asdf',
        payload: {
          transaction: Buffer.from([]),
        },
      },
    }

    await peerNetwork.peerManager.onMessage.emitAsync(peer, message)

    expect(verifyNewTransaction).toBeCalledTimes(1)
    expect(acceptTransaction).not.toBeCalled()

    peerNetwork.stop()
    await node.shutdown()
  })

  it('passes along the transaction if it verifies', async () => {
    const dataDir = `./testdbs/${makeDbName()}`
    const sdk = await IronfishSdk.init({ dataDir: dataDir })
    const node = await sdk.node()

    const peerNetwork = new PeerNetwork(mockPrivateIdentity(''), 'sdk/1/cli', require('ws'))
    const { peer } = getConnectedPeer(peerNetwork.peerManager)

    const acceptTransaction = jest
      .spyOn(node.memPool, 'acceptTransaction')
      .mockReturnValue(true)

    const syncTransaction = jest
      .spyOn(node.accounts, 'syncTransaction')
      .mockReturnValue(Promise.resolve())

    const verifyNewTransaction = jest
      .spyOn(node.captain.chain.verifier, 'verifyNewTransaction')
      // @ts-expect-error Returning some irrelevant data
      .mockImplementation((t) => {
        return { serializedTransaction: t, transaction: t }
      })

    node.networkBridge.attachPeerNetwork(peerNetwork)

    const message: IncomingPeerMessage<
      Gossip<NodeMessageType.NewTransaction, { transaction: Buffer }>
    > = {
      peerIdentity: peer.getIdentityOrThrow(),
      message: {
        type: NodeMessageType.NewTransaction,
        nonce: 'asdf',
        payload: {
          transaction: Buffer.from([]),
        },
      },
    }

    await peerNetwork.peerManager.onMessage.emitAsync(peer, message)

    expect(verifyNewTransaction).toBeCalledTimes(1)
    expect(acceptTransaction).toBeCalledTimes(1)
    expect(syncTransaction).toBeCalledTimes(1)

    peerNetwork.stop()
    await node.shutdown()
  })
})

describe('Node receives a new block from another node', () => {
  it('discards the block if it does not verify', async () => {
    const dataDir = `./testdbs/${makeDbName()}`

    const sdk = await IronfishSdk.init({
      dataDir: dataDir,
    })

    const node = await sdk.node()

    const peerNetwork = new PeerNetwork(mockPrivateIdentity(''), 'sdk/1/cli', require('ws'))
    const { peer } = getConnectedPeer(peerNetwork.peerManager)

    // @ts-expect-error Spying on a private method
    const onNewBlock = jest.spyOn(node.networkBridge, 'onNewBlock')
    const verifyNewBlock = jest.spyOn(node.captain.chain.verifier, 'verifyNewBlock')
    node.networkBridge.attachPeerNetwork(peerNetwork)

    const message: IncomingPeerMessage<Gossip<NodeMessageType.NewBlock, { block: Buffer }>> = {
      peerIdentity: peer.getIdentityOrThrow(),
      message: {
        type: NodeMessageType.NewBlock,
        nonce: 'asdf',
        payload: {
          block: Buffer.from([]),
        },
      },
    }

    await peerNetwork.peerManager.onMessage.emitAsync(peer, message)

    expect(verifyNewBlock).toBeCalledTimes(1)
    expect(onNewBlock).not.toBeCalled()

    peerNetwork.stop()
    await node.shutdown()
  })

  it('passes along the block if it verifies', async () => {
    const dataDir = `./testdbs/${makeDbName()}`

    const sdk = await IronfishSdk.init({
      dataDir: dataDir,
    })

    const node = await sdk.node()

    const peerNetwork = new PeerNetwork(mockPrivateIdentity(''), 'sdk/1/cli', require('ws'))
    const { peer } = getConnectedPeer(peerNetwork.peerManager)

    // @ts-expect-error Spying on a private method
    const onNewBlock = jest.spyOn(node.networkBridge, 'onNewBlock').mockImplementation(() => {})
    const verifyNewBlock = jest
      .spyOn(node.captain.chain.verifier, 'verifyNewBlock')
      // @ts-expect-error Returning some irrelevant data
      .mockImplementation((b) => {
        return { serializedBlock: b, block: b }
      })
    node.networkBridge.attachPeerNetwork(peerNetwork)

    const message: IncomingPeerMessage<Gossip<NodeMessageType.NewBlock, { block: Buffer }>> = {
      peerIdentity: peer.getIdentityOrThrow(),
      message: {
        type: NodeMessageType.NewBlock,
        nonce: 'asdf',
        payload: {
          block: Buffer.from([]),
        },
      },
    }

    await peerNetwork.peerManager.onMessage.emitAsync(peer, message)

    expect(verifyNewBlock).toBeCalledTimes(1)
    expect(onNewBlock).toBeCalledTimes(1)

    peerNetwork.stop()
    await node.shutdown()
  })
})
