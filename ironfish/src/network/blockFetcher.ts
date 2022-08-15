/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BufferMap } from 'buffer-map'
import { Assert } from '../assert'
import { Block, SerializedCompactBlock } from '../primitives/block'
import { BlockHash, BlockHeaderSerde } from '../primitives/blockheader'
import { ArrayUtils } from '../utils/array'
import { Identity } from './identity'
import { GetBlockTransactionsRequest } from './messages/getBlockTransactions'
import { GetCompactBlockRequest } from './messages/getCompactBlock'
import { PeerNetwork } from './peerNetwork'
import { Peer, PeerState } from './peers/peer'

/* Wait 1s before requesting a new hash to see if we receive the
 * block from the network first */
const WAIT_BEFORE_REQUEST_MS = 1000

type BlockState =
  | {
      action: 'BLOCK_REQUEST_SCHEDULED'
      timeout: NodeJS.Timeout
    }
  | {
      peer: Peer
      action: 'BLOCK_REQUEST_IN_FLIGHT'
      timeout: NodeJS.Timeout
      clearDisconnectHandler: () => void
    }
  | {
      peer: Peer
      action: 'TRANSACTION_REQUEST_IN_FLIGHT'
      partialBlock: SerializedCompactBlock
      timeout: NodeJS.Timeout
      clearDisconnectHandler: () => void
    }
  | {
      action: 'PROCESSING_COMPACT_BLOCK'
    }
  | {
      action: 'PROCESSING_FULL_BLOCK'
      block: Block
    }

export class BlockFetcher {
  // State of the current requests for each block
  private readonly pending = new BufferMap<BlockState>()

  // Set of peers that also may be able to fetch the block
  private readonly sources = new BufferMap<Set<Identity>>()

  private readonly peerNetwork: PeerNetwork

  constructor(peerNetwork: PeerNetwork) {
    this.peerNetwork = peerNetwork
  }

  /**
   * Called when a new block hash is received from the network
   * This schedules requests for the hash to be sent out and if
   * requests are already in progress, it adds the peer as a backup source */
  async receivedHash(hash: BlockHash, peer: Peer): Promise<void> {
    if (await this.peerNetwork.shouldIgnoreBlock(hash)) {
      this.removeBlock(hash)
      return
    }

    // If the peer is not connected or identified, don't add them as a source
    if (!peer.state.identity) {
      return
    }

    const currentState = this.pending.get(hash)

    const sources = this.sources.get(hash) || new Set<Identity>()
    sources.add(peer.state.identity)
    this.sources.set(hash, sources)

    if (!currentState) {
      const timeout = setTimeout(() => {
        const timeoutFn = async () => {
          if (await this.peerNetwork.shouldIgnoreBlock(hash)) {
            this.removeBlock(hash)
            return
          }

          await this.requestBlock(hash)
        }

        void timeoutFn()
      }, WAIT_BEFORE_REQUEST_MS)

      this.pending.set(hash, {
        action: 'BLOCK_REQUEST_SCHEDULED',
        timeout,
      })
    }
  }

  receivedBlockTransactions(hash: BlockHash): SerializedCompactBlock | null {
    const currentState = this.pending.get(hash)

    if (!currentState || currentState.action !== 'TRANSACTION_REQUEST_IN_FLIGHT') {
      return null
    }

    const block = currentState.partialBlock

    this.cleanupCallbacks(currentState)
    this.pending.set(hash, {
      action: 'PROCESSING_COMPACT_BLOCK',
    })

    return block
  }

  /**
   * Called when a compact block has been received from the network
   * but has not yet been processed (validated, assembled into a full
   * block, etc.) */
  receivedCompactBlock(compactBlock: SerializedCompactBlock, peer: Peer): void {
    const hash = BlockHeaderSerde.deserialize(compactBlock.header).hash
    const currentState = this.pending.get(hash)

    // If the peer is not connected or identified, don't add them as a source
    if (peer.state.identity) {
      const sources = this.sources.get(hash) || new Set<Identity>()
      sources.add(peer.state.identity)
      this.sources.set(hash, sources)
    }

    if (
      !currentState ||
      currentState.action === 'BLOCK_REQUEST_SCHEDULED' ||
      currentState.action === 'BLOCK_REQUEST_IN_FLIGHT'
    ) {
      currentState && this.cleanupCallbacks(currentState)
      this.pending.set(hash, {
        action: 'PROCESSING_COMPACT_BLOCK',
      })
    }
  }

  /**
   * Called when a block has been assembled from a compact block
   * but has not yet been validated and added to the chain. */
  receivedFullBlock(block: Block, peer: Peer): void {
    const hash = block.header.hash

    const currentState = this.pending.get(hash)

    // If the peer is not connected or identified, don't add them as a source
    if (peer.state.identity) {
      const sources = this.sources.get(hash) || new Set<Identity>()
      sources.add(peer.state.identity)
      this.sources.set(hash, sources)
    }

    if (
      !currentState ||
      currentState.action === 'BLOCK_REQUEST_SCHEDULED' ||
      currentState.action === 'BLOCK_REQUEST_IN_FLIGHT' ||
      currentState.action === 'TRANSACTION_REQUEST_IN_FLIGHT' ||
      currentState.action === 'PROCESSING_COMPACT_BLOCK'
    ) {
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
  getFullBlock(blockHash: BlockHash): Block | null {
    const currentState = this.pending.get(blockHash)

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
    this.sources.delete(hash)
  }

  private async requestFromNextPeer(hash: BlockHash): Promise<void> {
    if (await this.peerNetwork.shouldIgnoreBlock(hash)) {
      this.removeBlock(hash)
      return
    }

    // Clear the previous peer request state
    const currentState = this.pending.get(hash)
    currentState && this.cleanupCallbacks(currentState)

    await this.requestBlock(hash)
  }

  stop(): void {
    for (const [hash] of this.pending) {
      this.removeBlock(hash)
    }
  }

  requestTransactions(
    peer: Peer,
    block: SerializedCompactBlock,
    missingTransactions: number[],
  ): boolean {
    const hash = BlockHeaderSerde.deserialize(block.header).hash
    const message = new GetBlockTransactionsRequest(hash, missingTransactions)

    if (!peer.send(message)) {
      // TODO: Cleanup state
      return false
    }

    const currentState = this.pending.get(hash)

    currentState && this.cleanupCallbacks(currentState)

    const onPeerDisconnect = ({ peer, state }: { peer: Peer; state: PeerState }) => {
      if (state.type === 'DISCONNECTED') {
        peer.onStateChanged.off(onPeerDisconnect)
        // TODO: Abort and fetch full block
      }
    }
    peer.onStateChanged.on(onPeerDisconnect)

    const clearDisconnectHandler = () => {
      peer.onStateChanged.off(onPeerDisconnect)
    }

    const timeout = setTimeout(() => {
      // TODO: Abort and fetch full block
      return
    }, 5000)

    this.pending.set(hash, {
      action: 'TRANSACTION_REQUEST_IN_FLIGHT',
      peer,
      partialBlock: block,
      timeout,
      clearDisconnectHandler,
    })

    return true
  }

  private async requestBlock(hash: BlockHash): Promise<void> {
    // Get the next peer randomly to distribute load more evenly
    const peer = this.popRandomPeer(hash)
    if (!peer) {
      this.removeBlock(hash)
      return
    }

    const message = new GetCompactBlockRequest(hash)

    const sent = peer.send(message)

    if (!sent) {
      await this.requestFromNextPeer(hash)
      return
    }

    const onPeerDisconnect = async ({ peer, state }: { peer: Peer; state: PeerState }) => {
      if (state.type === 'DISCONNECTED') {
        peer.onStateChanged.off(onPeerDisconnect)
        await this.requestFromNextPeer(hash)
      }
    }
    peer.onStateChanged.on(onPeerDisconnect)

    const clearDisconnectHandler = () => {
      peer.onStateChanged.off(onPeerDisconnect)
    }

    const timeout = setTimeout(() => {
      const timeoutFn = async () => {
        await this.requestFromNextPeer(hash)
      }

      void timeoutFn()
    }, 5000)

    this.pending.set(hash, {
      peer,
      action: 'BLOCK_REQUEST_IN_FLIGHT',
      timeout,
      clearDisconnectHandler,
    })
  }

  private popRandomPeer(hash: BlockHash): Peer | null {
    const sources = this.sources.get(hash)

    if (!sources) {
      return null
    }

    const random = ArrayUtils.shuffle([...sources])

    let nextPeer = null
    let nextPeerId = null
    while (nextPeer === null && random.length > 0) {
      nextPeerId = random.pop()
      Assert.isNotUndefined(nextPeerId) // random.length > 0 in the while loop

      nextPeer = this.peerNetwork.peerManager.getPeer(nextPeerId)
    }

    // remove the peer from sources if we have one
    nextPeerId && sources.delete(nextPeerId)

    return nextPeer
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
