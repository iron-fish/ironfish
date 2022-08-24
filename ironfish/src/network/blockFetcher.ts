/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BufferMap } from 'buffer-map'
import { Block, SerializedCompactBlock } from '../primitives/block'
import { BlockHash, BlockHeaderSerde, SerializedBlockHeader } from '../primitives/blockheader'
import { ArrayUtils } from '../utils/array'
import { Identity } from './identity'
import { GetBlocksRequest } from './messages/getBlocks'
import {
  GetBlockTransactionsRequest,
  GetBlockTransactionsResponse,
} from './messages/getBlockTransactions'
import { GetCompactBlockRequest } from './messages/getCompactBlock'
import { BlockHashInfo } from './messages/newBlockHashes'
import { PeerNetwork, TransactionOrHash } from './peerNetwork'
import { Peer, PeerState } from './peers/peer'

/* Time to wait before requesting a new hash to see if we receive the
 * block from the network first */
const WAIT_BEFORE_REQUEST_MS = 1000

type BlockState =
  | {
      action: 'BLOCK_REQUEST_SCHEDULED'
      timeout: NodeJS.Timeout
      sources: Set<Identity> // Set of peers that have sent us the hash or compact block
    }
  | {
      action: 'BLOCK_REQUEST_IN_FLIGHT'
      peer: Identity
      timeout: NodeJS.Timeout
      clearDisconnectHandler: () => void
      sources: Set<Identity> // Set of peers that have sent us the hash or compact block
    }
  | {
      action: 'PROCESSING_COMPACT_BLOCK'
      peer: Identity
      compactBlock: SerializedCompactBlock
      sources: Set<Identity> // Set of peers that have sent us the hash or compact block
    }
  | {
      action: 'TRANSACTION_REQUEST_IN_FLIGHT'
      peer: Identity
      header: SerializedBlockHeader
      partialTransactions: TransactionOrHash[]
      timeout: NodeJS.Timeout
      clearDisconnectHandler: () => void
      sources: Set<Identity> // Set of peers that have sent us the hash or compact block
    }
  | {
      action: 'FULL_BLOCK_REQUEST_IN_FLIGHT'
      peer: Identity
      timeout: NodeJS.Timeout
      clearDisconnectHandler: () => void
      sources: Set<Identity> // Set of peers that have sent us the hash or compact block
    }
  | {
      action: 'PROCESSING_FULL_BLOCK'
      block: Block
    }

export class BlockFetcher {
  // State of the current requests for each block
  private readonly pending = new BufferMap<BlockState>()

  private readonly peerNetwork: PeerNetwork

  constructor(peerNetwork: PeerNetwork) {
    this.peerNetwork = peerNetwork
  }

  /**
   * Called when a new block hash is received from the network
   * This schedules requests for the hash to be sent out and if
   * requests are already in progress, it adds the peer as a backup source */
  receivedHash(hash: BlockHash, peer: Peer): void {
    // If the peer is not connected or identified, don't add them as a source
    const currentState = this.pending.get(hash)
    if (!peer.state.identity || currentState?.action === 'PROCESSING_FULL_BLOCK') {
      return
    }

    if (currentState) {
      // If the peer is not currently the one we're requesting from, add it to sources
      if (!('peer' in currentState && currentState.peer === peer.state.identity)) {
        currentState.sources.add(peer.state.identity)
      }
      return
    }

    const timeout = setTimeout(() => {
      this.requestCompactBlock(hash)
    }, WAIT_BEFORE_REQUEST_MS)

    const sources = new Set<Identity>([peer.state.identity])
    this.pending.set(hash, {
      action: 'BLOCK_REQUEST_SCHEDULED',
      timeout,
      sources,
    })
  }

  private requestCompactBlock(hash: BlockHash): void {
    const currentState = this.pending.get(hash)

    if (!currentState) {
      return
    }

    // If we are further along in the request cycle, don't send out another request
    if (
      currentState.action === 'PROCESSING_COMPACT_BLOCK' ||
      currentState.action === 'TRANSACTION_REQUEST_IN_FLIGHT' ||
      currentState.action === 'FULL_BLOCK_REQUEST_IN_FLIGHT' ||
      currentState.action === 'PROCESSING_FULL_BLOCK'
    ) {
      return
    }

    this.cleanupCallbacks(currentState)

    // Get the next peer randomly to distribute load more evenly
    // and if there are no more peers, remove the block state
    const peer = this.popRandomPeer(currentState.sources)
    if (!peer) {
      this.removeBlock(hash)
      return
    }

    const sent = peer.send(new GetCompactBlockRequest(hash))

    if (!sent || !peer.state.identity) {
      this.requestCompactBlock(hash)
      return
    }

    const onPeerDisconnect = ({ peer, state }: { peer: Peer; state: PeerState }) => {
      if (state.type === 'DISCONNECTED') {
        peer.onStateChanged.off(onPeerDisconnect)
        this.requestCompactBlock(hash)
      }
    }
    peer.onStateChanged.on(onPeerDisconnect)

    const clearDisconnectHandler = () => {
      peer.onStateChanged.off(onPeerDisconnect)
    }

    const timeout = setTimeout(() => {
      const timeoutFn = () => {
        this.requestCompactBlock(hash)
      }

      void timeoutFn()
    }, 5000)

    this.pending.set(hash, {
      action: 'BLOCK_REQUEST_IN_FLIGHT',
      peer: peer.state.identity,
      timeout,
      clearDisconnectHandler,
      sources: currentState.sources,
    })
  }

  /**
   * Called when a compact block has been received from the network
   * but has not yet been processed (validated, assembled into a full
   * block, etc.) Returns true if the caller (PeerNetwork) should continue
   * processing this compact block or not */
  receivedCompactBlock(compactBlock: SerializedCompactBlock, peer: Peer): boolean {
    const hash = BlockHeaderSerde.deserialize(compactBlock.header).hash
    const currentState = this.pending.get(hash)

    // If the peer is not connected or identified, ignore them
    if (!peer.state.identity) {
      return false
    }

    if (!currentState) {
      this.pending.set(hash, {
        action: 'PROCESSING_COMPACT_BLOCK',
        peer: peer.state.identity,
        compactBlock,
        sources: new Set<Identity>(),
      })
      // Return to PeerNetwork to fill from mempool and request missing transactions
      return true
    }

    if (currentState.action === 'PROCESSING_FULL_BLOCK') {
      return false
    }

    // If we are further along in the request cycle, just add this peer to sources
    if (
      currentState.action === 'PROCESSING_COMPACT_BLOCK' ||
      currentState.action === 'TRANSACTION_REQUEST_IN_FLIGHT' ||
      currentState.action === 'FULL_BLOCK_REQUEST_IN_FLIGHT'
    ) {
      currentState.sources.add(peer.state.identity)
      return false
    }

    this.cleanupCallbacks(currentState)

    this.pending.set(hash, {
      action: 'PROCESSING_COMPACT_BLOCK',
      peer: peer.state.identity,
      compactBlock,
      sources: currentState.sources,
    })
    // Return to PeerNetwork to fill from mempool and request missing transactions
    return true
  }

  receivedBlockTransactions(message: GetBlockTransactionsResponse): Block | null {
    const hash = message.blockHash
    const currentState = this.pending.get(hash)

    // If we were not waiting for a transaction request, just ignore it
    if (!currentState || currentState.action !== 'TRANSACTION_REQUEST_IN_FLIGHT') {
      return null
    }

    this.cleanupCallbacks(currentState)

    // check if we're missing transactions
    const assembleResult = this.peerNetwork.assembleBlockFromResponse(
      currentState.partialTransactions,
      message.serializedTransactions,
    )

    // Either mismatched hashes or missing transactions
    if (!assembleResult.ok) {
      this.requestFullBlock(hash)
      return null
    }

    const block = new Block(
      BlockHeaderSerde.deserialize(currentState.header),
      assembleResult.transactions,
    )

    this.pending.set(hash, {
      action: 'PROCESSING_FULL_BLOCK',
      block,
    })

    return block
  }

  /**
   * Called when a block has been assembled from a compact block
   * but has not yet been validated and added to the chain. */
  receivedFullBlock(block: Block): void {
    const hash = block.header.hash

    const currentState = this.pending.get(hash)

    if (currentState?.action !== 'PROCESSING_FULL_BLOCK') {
      currentState && this.cleanupCallbacks(currentState)
      this.pending.set(hash, {
        action: 'PROCESSING_FULL_BLOCK',
        block,
      })
    }
  }

  /**
   * Handles the case where a block may be undergoing verification, but peers
   * that received the compact block may need transactions from it. */
  getFullBlock(hash: BlockHash): Block | null {
    const currentState = this.pending.get(hash)

    if (!currentState || currentState.action !== 'PROCESSING_FULL_BLOCK') {
      return null
    }

    return currentState.block
  }

  /**
   * Called when a block has been added to the chain or is known to be invalid. */
  removeBlock(hash: BlockHash): void {
    const currentState = this.pending.get(hash)

    currentState && this.cleanupCallbacks(currentState)

    this.pending.delete(hash)
  }

  stop(): void {
    for (const [hash] of this.pending) {
      this.removeBlock(hash)
    }
  }

  requestTransactions(
    peer: Peer,
    header: SerializedBlockHeader,
    partialTransactions: TransactionOrHash[],
    missingTransactions: number[],
  ): void {
    const hash = BlockHeaderSerde.deserialize(header).hash
    const currentState = this.pending.get(hash)

    if (!currentState || currentState.action === 'PROCESSING_FULL_BLOCK') {
      return
    }

    const message = new GetBlockTransactionsRequest(hash, missingTransactions)

    const sent = peer.send(message)
    if (!sent || !peer.state.identity) {
      this.requestFullBlock(hash)
      return
    }

    const onPeerDisconnect = ({ state }: { state: PeerState }) => {
      if (state.type === 'DISCONNECTED') {
        this.requestFullBlock(hash)
      }
    }

    peer.onStateChanged.on(onPeerDisconnect)

    const clearDisconnectHandler = () => {
      peer.onStateChanged.off(onPeerDisconnect)
    }

    const timeout = setTimeout(() => {
      this.requestFullBlock(hash)
    }, 5000)

    this.pending.set(hash, {
      action: 'TRANSACTION_REQUEST_IN_FLIGHT',
      peer: peer.state.identity,
      header,
      partialTransactions,
      timeout,
      clearDisconnectHandler,
      sources: currentState.sources,
    })

    return
  }

  requestFullBlock(hash: BlockHash): void {
    const currentState = this.pending.get(hash)

    if (!currentState || currentState.action === 'PROCESSING_FULL_BLOCK') {
      return
    }

    this.cleanupCallbacks(currentState)

    const peer = this.popRandomPeer(currentState.sources)
    if (!peer) {
      this.removeBlock(hash)
      return
    }

    const message = new GetBlocksRequest(hash, 1)

    const sent = peer.send(message)

    if (!sent || !peer.state.identity) {
      this.requestFullBlock(hash)
      return
    }

    const onPeerDisconnect = ({ peer, state }: { peer: Peer; state: PeerState }) => {
      if (state.type === 'DISCONNECTED') {
        peer.onStateChanged.off(onPeerDisconnect)
        this.requestFullBlock(hash)
      }
    }
    peer.onStateChanged.on(onPeerDisconnect)

    const clearDisconnectHandler = () => {
      peer.onStateChanged.off(onPeerDisconnect)
    }

    const timeout = setTimeout(() => {
      this.requestFullBlock(hash)
    }, 5000)

    this.pending.set(hash, {
      action: 'FULL_BLOCK_REQUEST_IN_FLIGHT',
      peer: peer.state.identity,
      timeout,
      clearDisconnectHandler,
      sources: currentState.sources,
    })
  }

  // Get the next peer to request from. Returns peers that have sent compact blocks first
  // then returns peers who have sent hashes
  private popRandomPeer(sources: Set<Identity>): Peer | null {
    const randomizedPeers = ArrayUtils.shuffle([...sources])

    for (const peerId of randomizedPeers) {
      const nextPeer = this.peerNetwork.peerManager.getPeer(peerId)
      if (nextPeer) {
        // remove the peer from sources if we have one and return
        sources.delete(peerId)
        return nextPeer
      }
    }

    return null
  }

  private cleanupCallbacks(state: BlockState) {
    if (state.action === 'BLOCK_REQUEST_IN_FLIGHT') {
      clearTimeout(state.timeout)
      state.clearDisconnectHandler()
    } else if (state.action === 'BLOCK_REQUEST_SCHEDULED') {
      clearTimeout(state.timeout)
    } else if (state.action === 'TRANSACTION_REQUEST_IN_FLIGHT') {
      clearTimeout(state.timeout)
      state.clearDisconnectHandler()
    }
  }
}
