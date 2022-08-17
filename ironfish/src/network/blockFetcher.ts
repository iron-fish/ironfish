/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BufferMap } from 'buffer-map'
import { Assert } from '../assert'
import { Block, SerializedCompactBlock } from '../primitives/block'
import { BlockHash, BlockHeaderSerde, SerializedBlockHeader } from '../primitives/blockheader'
import { ArrayUtils } from '../utils/array'
import { Identity } from './identity'
import { GetBlocksRequest } from './messages/getBlocks'
import { GetBlockTransactionsRequest } from './messages/getBlockTransactions'
import { GetCompactBlockRequest } from './messages/getCompactBlock'
import { BlockHashInfo } from './messages/newBlockHashes'
import { PeerNetwork, TransactionOrHash } from './peerNetwork'
import { Peer, PeerState } from './peers/peer'

/* Wait 1s before requesting a new hash to see if we receive the
 * block from the network first */
const WAIT_BEFORE_REQUEST_MS = 1000

// Whether the peer sent us a block hash or a compact block
type SourceType = 'HASH' | 'COMPACT'

type BlockState =
  | {
      action: 'BLOCK_REQUEST_SCHEDULED'
      sequence: number
      timeout: NodeJS.Timeout
      sources: Map<Identity, 'HASH'> // Set of peers that have sent us the hash or compact block
    }
  | {
      action: 'BLOCK_REQUEST_IN_FLIGHT'
      peer: Identity
      sequence: number
      timeout: NodeJS.Timeout
      clearDisconnectHandler: () => void
      sources: Map<Identity, 'HASH'> // Set of peers that have sent us the hash or compact block
    }
  | {
      action: 'PROCESSING_COMPACT_BLOCK'
      peer: Identity
      compactBlock: SerializedCompactBlock
      sources: Map<Identity, SourceType> // Set of peers that have sent us the hash or compact block
    }
  | {
      action: 'TRANSACTION_REQUEST_IN_FLIGHT'
      peer: Identity
      header: SerializedBlockHeader
      partialTransactions: TransactionOrHash[]
      timeout: NodeJS.Timeout
      clearDisconnectHandler: () => void
      sources: Map<Identity, SourceType> // Set of peers that have sent us the hash or compact block
    }
  | {
      action: 'FULL_BLOCK_REQUEST_IN_FLIGHT'
      peer: Identity
      header: SerializedBlockHeader
      partialTransactions: TransactionOrHash[]
      timeout: NodeJS.Timeout
      clearDisconnectHandler: () => void
      sources: Map<Identity, SourceType> // Set of peers that have sent us the hash or compact block
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
  async receivedHash({ hash, sequence }: BlockHashInfo, peer: Peer): Promise<void> {
    // If the peer is not connected or identified, don't add them as a source
    const currentState = this.pending.get(hash)
    if (!peer.state.identity || currentState?.action === 'PROCESSING_FULL_BLOCK') {
      return
    }

    if (currentState) {
      if (
        !currentState.sources.has(peer.state.identity) &&
        !('peer' in currentState && currentState.peer === peer.state.identity)
      ) {
        currentState.sources.set(peer.state.identity, 'HASH')
      }
      return
    }

    if (!(await this.peerNetwork.alreadyHaveBlock(hash))) {
      const timeout = setTimeout(() => {
        const timeoutFn = async () => {
          await this.requestCompactBlock(hash)
        }

        void timeoutFn()
      }, WAIT_BEFORE_REQUEST_MS)

      const sources = new Map<Identity, 'HASH'>()
      sources.set(peer.state.identity, 'HASH')
      this.pending.set(hash, {
        action: 'BLOCK_REQUEST_SCHEDULED',
        sequence,
        timeout,
        sources,
      })
    }
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

    if (currentState?.action === 'PROCESSING_FULL_BLOCK') {
      return false
    }

    if (
      currentState?.action === 'BLOCK_REQUEST_SCHEDULED' ||
      currentState?.action === 'BLOCK_REQUEST_IN_FLIGHT'
    ) {
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

    if (!currentState) {
      this.pending.set(hash, {
        action: 'PROCESSING_COMPACT_BLOCK',
        peer: peer.state.identity,
        compactBlock,
        sources: new Map<Identity, SourceType>(),
      })
      // Return to PeerNetwork to fill from mempool and request missing transactions
      return true
    }

    // Either "PROCESSING_COMPACT_BLOCK" | "TRANSACTION_REQUEST_IN_FLIGHT"
    // Just add the peer if we don't already have it in sources
    if (
      !currentState.sources.has(peer.state.identity) &&
      !(currentState.peer === peer.state.identity)
    ) {
      currentState.sources.set(peer.state.identity, 'COMPACT')
    }

    return false
  }

  receivedBlockTransactions(hash: BlockHash): {
    header: SerializedBlockHeader
    partialTransactions: TransactionOrHash[]
  } | null {
    const currentState = this.pending.get(hash)

    if (!currentState || currentState.action !== 'TRANSACTION_REQUEST_IN_FLIGHT') {
      return null
    }

    this.cleanupCallbacks(currentState)

    const partialBlock = {
      header: currentState.header,
      partialTransactions: currentState.partialTransactions,
    }

    this.pending.set(hash, {
      action: 'PROCESSING_COMPACT_BLOCK',
      ...partialBlock,
    })

    return partialBlock
  }

  // /**
  //  * Called when a block has been assembled from a compact block
  //  * but has not yet been validated and added to the chain. */
  // receivedFullBlock(block: Block, peer: Peer): void {
  //   const hash = block.header.hash

  //   const currentState = this.pending.get(hash)

  //   // If the peer is not connected or identified, don't add them as a source
  //   if (peer.state.identity && currentState) {
  //     const sources = this.sources.get(hash) || new Set<Identity>()
  //     sources.add(peer.state.identity)
  //     this.sources.set(hash, sources)
  //   }

  //   if (
  //     !currentState ||
  //     currentState.action === 'BLOCK_REQUEST_SCHEDULED' ||
  //     currentState.action === 'BLOCK_REQUEST_IN_FLIGHT' ||
  //     currentState.action === 'TRANSACTION_REQUEST_IN_FLIGHT' ||
  //     currentState.action === 'PROCESSING_COMPACT_BLOCK' ||
  //     currentState.action === 'RECEIVED_COMPACT_BLOCK'
  //   ) {
  //     currentState && this.cleanupCallbacks(currentState)
  //     this.pending.set(hash, {
  //       action: 'PROCESSING_FULL_BLOCK',
  //       block,
  //     })
  //   }
  // }

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

    if (!peer.send(message)) {
      
    }

    const currentState = this.pending.get(hash)

    currentState && this.cleanupCallbacks(currentState)

    const onPeerDisconnect = async ({ state }: { state: PeerState }) => {
      if (state.type === 'DISCONNECTED') {
        const currentState = this.pending.get(hash)
        currentState && this.cleanupCallbacks(currentState)

        if (!(await this.peerNetwork.alreadyHaveBlock(hash))) {
          await this.requestFullBlock(hash)
        }
      }
    }

    peer.onStateChanged.on(onPeerDisconnect)

    const clearDisconnectHandler = () => {
      peer.onStateChanged.off(onPeerDisconnect)
    }

    const timeout = setTimeout(() => {
      await this.requestFullBlock(hash)
    }, 5000)

    this.pending.set(hash, {
      action: 'TRANSACTION_REQUEST_IN_FLIGHT',
      peer,
      header,
      partialTransactions,
      timeout,
      clearDisconnectHandler,
    })

    return
  }

  // async requestFullBlock(hash: BlockHash): Promise<void> {
  //   const currentState = this.pending.get(hash)

  //   if (!currentState || currentState.action !== 'PROCESSING_COMPACT_BLOCK') {
  //     return
  //   }

  //   const peerInfo = this.popRandomPeer(currentState.sources)
  //   if (!peerInfo) {
  //     this.removeBlock(hash)
  //     return
  //   }

  //   const message = new GetBlocksRequest(hash, 1)

  //   const sent = peer.send(message)

  //   if (!sent) {
  //     await this.requestFullBlock(hash)
  //     return
  //   }

  //   const onPeerDisconnect = async ({ peer, state }: { peer: Peer; state: PeerState }) => {
  //     if (state.type === 'DISCONNECTED') {
  //       peer.onStateChanged.off(onPeerDisconnect)
  //       await this.requestFullBlock(hash)
  //     }
  //   }
  //   peer.onStateChanged.on(onPeerDisconnect)

  //   const clearDisconnectHandler = () => {
  //     peer.onStateChanged.off(onPeerDisconnect)
  //   }

  //   const timeout = setTimeout(() => {
  //     const timeoutFn = async () => {
  //       await this.requestFullBlock(hash)
  //     }

  //     void timeoutFn()
  //   }, 5000)

  //   this.pending.set(hash, {
  //     peer,
  //     action: 'BLOCK_REQUEST_IN_FLIGHT',
  //     timeout,
  //     clearDisconnectHandler,
  //   })
  // }

  private async requestFromNextPeer(hash: BlockHash): Promise<void> {
    const currentState = this.pending.get(hash)

    // We don't have any peers to request from
    if (!currentState) {
      return
    }

    // If we already have the full block, no need to request it
    if (currentState.action === 'PROCESSING_FULL_BLOCK') {
      return
    }

    this.cleanupCallbacks(currentState)

    // Get the next peer randomly to distribute load more evenly
    const peerInfo = this.popRandomPeer(currentState.sources)
    if (!peerInfo) {
      this.removeBlock(hash)
      return
    }

    const { peer } = peerInfo

    const sent = peer.send(new GetCompactBlockRequest(hash))

    if (!sent || !peer.state.identity) {
      await this.requestCompactBlock(hash)
      return
    }

    const onPeerDisconnect = async ({ peer, state }: { peer: Peer; state: PeerState }) => {
      if (state.type === 'DISCONNECTED') {
        peer.onStateChanged.off(onPeerDisconnect)
        await this.requestCompactBlock(hash)
      }
    }
    peer.onStateChanged.on(onPeerDisconnect)

    const clearDisconnectHandler = () => {
      peer.onStateChanged.off(onPeerDisconnect)
    }

    const timeout = setTimeout(() => {
      const timeoutFn = async () => {
        await this.requestCompactBlock(hash)
      }

      void timeoutFn()
    }, 5000)

    this.pending.set(hash, {
      action: 'BLOCK_REQUEST_IN_FLIGHT',
      peer: peer.state.identity,
      sequence: currentState.sequence,
      timeout,
      clearDisconnectHandler,
      sources: currentState.sources,
    })
  }

  private async requestCompactBlock(hash: BlockHash): Promise<void> {
    const currentState = this.pending.get(hash)

    if (!currentState) {
      return
    }

    // If we are further along in the request cycle, don't send out another request
    if (
      currentState.action === 'PROCESSING_COMPACT_BLOCK' ||
      currentState.action === 'TRANSACTION_REQUEST_IN_FLIGHT' ||
      currentState.action === 'PROCESSING_FULL_BLOCK'
    ) {
      return
    }

    this.cleanupCallbacks(currentState)

    // Get the next peer randomly to distribute load more evenly
    const peerInfo = this.popRandomPeer(currentState.sources)
    if (!peerInfo) {
      this.removeBlock(hash)
      return
    }

    const peer = peerInfo.peer

    const sent = peer.send(new GetCompactBlockRequest(hash))

    if (!sent || !peer.state.identity) {
      await this.requestCompactBlock(hash)
      return
    }

    const onPeerDisconnect = async ({ peer, state }: { peer: Peer; state: PeerState }) => {
      if (state.type === 'DISCONNECTED') {
        peer.onStateChanged.off(onPeerDisconnect)
        await this.requestCompactBlock(hash)
      }
    }
    peer.onStateChanged.on(onPeerDisconnect)

    const clearDisconnectHandler = () => {
      peer.onStateChanged.off(onPeerDisconnect)
    }

    const timeout = setTimeout(() => {
      const timeoutFn = async () => {
        await this.requestCompactBlock(hash)
      }

      void timeoutFn()
    }, 5000)

    this.pending.set(hash, {
      action: 'BLOCK_REQUEST_IN_FLIGHT',
      peer: peer.state.identity,
      sequence: currentState.sequence,
      timeout,
      clearDisconnectHandler,
      sources: currentState.sources,
    })
  }

  // Get the next peer to request from. Returns peers that have sent compact blocks first
  // then returns peers who have sent hashes
  private popRandomPeer(
    sources: Map<Identity, SourceType>,
  ): { peer: Peer; source: SourceType } | null {
    const compactSources: [string, 'COMPACT'][] = []
    const hashSources: [string, 'HASH'][] = []
    for (const [peer, type] of sources) {
      if (type === 'HASH') {
        hashSources.push([peer, 'HASH'])
      } else {
        compactSources.push([peer, 'COMPACT'])
      }
    }
    const random: [string, SourceType][] = [
      ...ArrayUtils.shuffle(hashSources),
      ...ArrayUtils.shuffle(compactSources),
    ]

    let nextPeer: Peer | null = null
    let nextPeerIdentity: string | null = null
    let nextPeerType: SourceType | null = null
    while (nextPeer === null && random.length > 0) {
      const nextPeerInfo = random.pop()
      Assert.isNotUndefined(nextPeerInfo) // random.length > 0 in the while loop

      nextPeerIdentity = nextPeerInfo[0]
      nextPeerType = nextPeerInfo[1]
      nextPeer = this.peerNetwork.peerManager.getPeer(nextPeerInfo[0])
    }

    if (nextPeerIdentity === null || nextPeer === null || nextPeerType === null) {
      return null
    }

    // remove the peer from sources if we have one
    sources.delete(nextPeerIdentity)

    return { peer: nextPeer, source: nextPeerType }
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
