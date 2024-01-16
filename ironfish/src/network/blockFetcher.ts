/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BufferMap } from 'buffer-map'
import { Block, CompactBlock } from '../primitives/block'
import { BlockHash, BlockHeader } from '../primitives/blockheader'
import { ArrayUtils } from '../utils/array'
import { CompactBlockUtils } from '../utils/compactblock'
import { Identity } from './identity'
import { GetBlocksRequest } from './messages/getBlocks'
import {
  GetBlockTransactionsRequest,
  GetBlockTransactionsResponse,
} from './messages/getBlockTransactions'
import { GetCompactBlockRequest } from './messages/getCompactBlock'
import { PeerNetwork, TransactionOrHash } from './peerNetwork'
import { Peer, PeerState } from './peers/peer'

/* Time to wait before requesting a new hash to see if we receive the
 * block from the network first */
const WAIT_BEFORE_REQUEST_MS = 1000

/* Time to wait for a response to a request for a compact block */
const REQUEST_COMPACT_BLOCK_TIMEOUT_MS = 5000

/* Time to wait for a response to a request for block transactions */
const REQUEST_BLOCK_TRANSACTIONS_TIMEOUT_MS = 5000

/* Time to wait for a response to a request for a full block */
const REQUEST_FULL_BLOCK_TIMEOUT_MS = 5000

type BlockState =
  | {
      action: 'COMPACT_BLOCK_REQUEST_SCHEDULED'
      timeout: NodeJS.Timeout
      sources: Set<Identity> // Set of peers that have sent us the hash or compact block
      firstSeenBy: Identity
    }
  | {
      action: 'COMPACT_BLOCK_REQUEST_IN_FLIGHT'
      peer: Identity
      timeout: NodeJS.Timeout
      clearDisconnectHandler: () => void
      sources: Set<Identity> // Set of peers that have sent us the hash or compact block
      firstSeenBy: Identity
    }
  | {
      action: 'PROCESSING_COMPACT_BLOCK'
      peer: Identity
      compactBlock: CompactBlock
      sources: Set<Identity> // Set of peers that have sent us the hash or compact block
      firstSeenBy: Identity
    }
  | {
      action: 'TRANSACTION_REQUEST_IN_FLIGHT'
      peer: Identity
      header: BlockHeader
      partialTransactions: TransactionOrHash[]
      timeout: NodeJS.Timeout
      clearDisconnectHandler: () => void
      sources: Set<Identity> // Set of peers that have sent us the hash or compact block
      firstSeenBy: Identity
    }
  | {
      action: 'FULL_BLOCK_REQUEST_IN_FLIGHT'
      peer: Identity
      timeout: NodeJS.Timeout
      clearDisconnectHandler: () => void
      sources: Set<Identity> // Set of peers that have sent us the hash or compact block
      firstSeenBy: Identity
    }
  | {
      action: 'PROCESSING_FULL_BLOCK'
      block: Block
      firstSeenBy: Identity | null
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
    // Drop peers without an identity or when we're already processing a full block
    const currentState = this.pending.get(hash)
    if (!peer.state.identity || currentState?.action === 'PROCESSING_FULL_BLOCK') {
      return
    }

    if (currentState) {
      // If we're already fetching this block and we're not using this peer to fetch from,
      // add the peer as a potential backup
      if (!('peer' in currentState && currentState.peer === peer.state.identity)) {
        currentState.sources.add(peer.state.identity)
      }
      return
    }

    // Otherwise, schedule a request for the block and add the peer as the first source
    const timeout = setTimeout(() => {
      this.requestCompactBlock(hash)
    }, WAIT_BEFORE_REQUEST_MS)

    const sources = new Set<Identity>([peer.state.identity])
    this.pending.set(hash, {
      action: 'COMPACT_BLOCK_REQUEST_SCHEDULED',
      timeout,
      sources,
      firstSeenBy: peer.state.identity,
    })
  }

  private requestCompactBlock(hash: BlockHash): void {
    const currentState = this.pending.get(hash)

    // State may be gone if we already received a full or compact block, and it was rejected
    // or added to chain
    if (!currentState) {
      return
    }

    // If we've already reached a later step, don't send out another request
    if (
      currentState.action !== 'COMPACT_BLOCK_REQUEST_SCHEDULED' &&
      currentState.action !== 'COMPACT_BLOCK_REQUEST_IN_FLIGHT'
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
    }, REQUEST_COMPACT_BLOCK_TIMEOUT_MS)

    this.pending.set(hash, {
      action: 'COMPACT_BLOCK_REQUEST_IN_FLIGHT',
      peer: peer.state.identity,
      timeout,
      clearDisconnectHandler,
      sources: currentState.sources,
      firstSeenBy: currentState.firstSeenBy,
    })
  }

  /**
   * Called when a compact block has been received from the network
   * but has not yet been processed (validated, assembled into a full
   * block, etc.) Returns true if the caller (PeerNetwork) should continue
   * processing this compact block or not */
  receivedCompactBlock(hash: BlockHash, compactBlock: CompactBlock, peer: Peer): boolean {
    const currentState = this.pending.get(hash)

    // If the peer is not connected or identified, ignore them
    if (!peer.state.identity) {
      return false
    }

    if (
      currentState &&
      currentState.action !== 'COMPACT_BLOCK_REQUEST_IN_FLIGHT' &&
      currentState.action !== 'COMPACT_BLOCK_REQUEST_SCHEDULED'
    ) {
      // If we are further along in the request cycle, just add this peer to sources
      if (currentState.action !== 'PROCESSING_FULL_BLOCK') {
        currentState.sources.add(peer.state.identity)
      }

      return false
    }

    currentState && this.cleanupCallbacks(currentState)

    // If we already had a request in flight to a peer, put them back into the pool of sources
    if (currentState && currentState.action === 'COMPACT_BLOCK_REQUEST_IN_FLIGHT') {
      currentState.sources.add(currentState.peer)
    }

    this.pending.set(hash, {
      action: 'PROCESSING_COMPACT_BLOCK',
      peer: peer.state.identity,
      compactBlock,
      sources: currentState ? currentState.sources : new Set<Identity>(),
      firstSeenBy: currentState ? currentState.firstSeenBy : peer.state.identity,
    })
    return true
  }

  /**
   * Return the first peer that notified us of this block
   */
  firstSeenBy(hash: BlockHash): Identity | null {
    const currentState = this.pending.get(hash)
    return currentState ? currentState.firstSeenBy : null
  }

  requestBlockTransactions(
    peer: Peer,
    header: BlockHeader,
    partialTransactions: TransactionOrHash[],
    missingTransactions: number[],
  ): void {
    const hash = header.hash
    const currentState = this.pending.get(hash)

    if (!currentState || currentState.action === 'PROCESSING_FULL_BLOCK') {
      return
    }

    const message = new GetBlockTransactionsRequest(hash, missingTransactions)

    const sent = peer.send(message)
    // Note that if transaction fetching fails, we fall back to fetching the full block.
    // This is intentional to minimize additional round-trip messages, but there's
    // likely room for improvement here.
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
    }, REQUEST_BLOCK_TRANSACTIONS_TIMEOUT_MS)

    this.pending.set(hash, {
      action: 'TRANSACTION_REQUEST_IN_FLIGHT',
      peer: peer.state.identity,
      header,
      partialTransactions,
      timeout,
      clearDisconnectHandler,
      sources: currentState.sources,
      firstSeenBy: currentState.firstSeenBy,
    })

    return
  }

  /**
   * Called when receiving a response to a request for missing transactions on a block. */
  receivedBlockTransactions(message: GetBlockTransactionsResponse): Block | null {
    const hash = message.blockHash
    const currentState = this.pending.get(hash)

    // If we were not waiting for a transaction request, ignore it
    if (!currentState || currentState.action !== 'TRANSACTION_REQUEST_IN_FLIGHT') {
      return null
    }

    this.cleanupCallbacks(currentState)

    // Check if we're still missing transactions
    const assembleResult = CompactBlockUtils.assembleBlockFromResponse(
      currentState.partialTransactions,
      message.transactions,
    )

    // Either mismatched hashes or missing transactions
    if (!assembleResult.ok) {
      this.requestFullBlock(hash)
      return null
    }

    const block = new Block(currentState.header, assembleResult.transactions)

    this.pending.set(hash, {
      action: 'PROCESSING_FULL_BLOCK',
      block,
      firstSeenBy: currentState.firstSeenBy,
    })

    return block
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
    }, REQUEST_FULL_BLOCK_TIMEOUT_MS)

    this.pending.set(hash, {
      action: 'FULL_BLOCK_REQUEST_IN_FLIGHT',
      peer: peer.state.identity,
      timeout,
      clearDisconnectHandler,
      sources: currentState.sources,
      firstSeenBy: currentState.firstSeenBy,
    })
  }

  /**
   * Called when a block has been assembled from a compact block
   * but has not yet been validated and added to the chain. */
  receivedFullBlock(block: Block, peer: Peer): void {
    const hash = block.header.hash

    const currentState = this.pending.get(hash)

    if (currentState?.action !== 'PROCESSING_FULL_BLOCK') {
      currentState && this.cleanupCallbacks(currentState)
      this.pending.set(hash, {
        action: 'PROCESSING_FULL_BLOCK',
        block,
        firstSeenBy: currentState?.firstSeenBy ?? peer.state.identity ?? null,
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
    if (state.action === 'COMPACT_BLOCK_REQUEST_IN_FLIGHT') {
      clearTimeout(state.timeout)
      state.clearDisconnectHandler()
    } else if (state.action === 'COMPACT_BLOCK_REQUEST_SCHEDULED') {
      clearTimeout(state.timeout)
    } else if (state.action === 'TRANSACTION_REQUEST_IN_FLIGHT') {
      clearTimeout(state.timeout)
      state.clearDisconnectHandler()
    } else if (state.action === 'FULL_BLOCK_REQUEST_IN_FLIGHT') {
      clearTimeout(state.timeout)
      state.clearDisconnectHandler()
    }
  }
}
