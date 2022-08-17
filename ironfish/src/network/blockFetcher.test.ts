/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { blake3 } from '@napi-rs/blake-hash'
import { v4 as uuid } from 'uuid'
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
import { GetCompactBlockRequest } from './messages/getCompactBlock'
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
  const peerIdentity = peer.getIdentityOrThrow()
  return {
    peerIdentity,
    message: new NewBlockHashesMessage([
      { hash: block.header.hash, sequence: block.header.sequence },
    ]),
  }
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
})
