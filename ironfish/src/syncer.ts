/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert } from './assert'
import { Blockchain } from './blockchain'
import { GENESIS_BLOCK_SEQUENCE, VerificationResultReason } from './consensus'
import { Event } from './event'
import { createRootLogger, Logger } from './logger'
import { Meter, MetricsMonitor } from './metrics'
import { Peer, PeerNetwork } from './network'
import { BAN_SCORE, PeerState } from './network/peers/peer'
import { Block, SerializedBlock } from './primitives/block'
import { BlockHeader } from './primitives/blockheader'
import { Strategy } from './strategy'
import { Telemetry } from './telemetry'
import { BenchUtils, ErrorUtils, HashUtils, MathUtils, SetTimeoutToken } from './utils'
import { ArrayUtils } from './utils/array'

const SYNCER_TICK_MS = 10 * 1000
const LINEAR_ANCESTOR_SEARCH = 3
const REQUEST_BLOCKS_PER_MESSAGE = 20

class AbortSyncingError extends Error {}

// Whitelist of node names to sync from
const whitelist = new Set<string>([])

export class Syncer {
  readonly peerNetwork: PeerNetwork
  readonly chain: Blockchain
  readonly strategy: Strategy
  readonly metrics: MetricsMonitor
  readonly telemetry: Telemetry
  readonly logger: Logger
  readonly speed: Meter

  state: 'stopped' | 'idle' | 'stopping' | 'syncing'
  stopping: Promise<void> | null
  cancelLoop: SetTimeoutToken | null
  loader: Peer | null = null
  blocksPerMessage: number

  onGossip = new Event<[Block]>()

  constructor(options: {
    peerNetwork: PeerNetwork
    chain: Blockchain
    strategy: Strategy
    telemetry: Telemetry
    metrics?: MetricsMonitor
    logger?: Logger
    blocksPerMessage?: number
  }) {
    const logger = options.logger || createRootLogger()

    this.peerNetwork = options.peerNetwork
    this.chain = options.chain
    this.strategy = options.strategy
    this.logger = logger.withTag('syncer')
    this.telemetry = options.telemetry

    this.metrics = options.metrics || new MetricsMonitor({ logger: this.logger })

    this.state = 'stopped'
    this.speed = this.metrics.addMeter()
    this.stopping = null
    this.cancelLoop = null

    this.blocksPerMessage = options.blocksPerMessage ?? REQUEST_BLOCKS_PER_MESSAGE
  }

  async start(): Promise<void> {
    if (this.state !== 'stopped') {
      return
    }
    this.state = 'idle'

    this.eventLoop()
    await Promise.resolve()
  }

  async stop(): Promise<void> {
    if (this.state === 'stopped') {
      return
    }

    if (this.state === 'stopping') {
      await this.stopping
      return
    }

    this.state = 'stopping'

    if (this.cancelLoop) {
      clearTimeout(this.cancelLoop)
    }

    if (this.loader) {
      this.stopSync(this.loader)
    }

    await this.wait()
    this.state = 'stopped'
  }

  eventLoop(): void {
    if (this.state === 'stopped' || this.state === 'stopping') {
      return
    }

    if (this.state === 'idle') {
      this.findPeer()
    }

    setTimeout(() => this.eventLoop(), SYNCER_TICK_MS)
  }

  findPeer(): void {
    const head = this.chain.head

    if (!head) {
      return
    }

    // Find all allowed peers that have more work than we have
    const peers = this.peerNetwork.peerManager
      .getConnectedPeers()
      .filter((peer) => peer.work && peer.work > head.work)
      .filter((peer) => (whitelist.size ? whitelist.has(peer.name || '') : true))

    // Get a random peer with higher work. We do this to encourage
    // peer diversity so the highest work peer isn't overwhelmed
    // as well as helping to make sure we don't get stuck with unstable peers
    if (peers.length > 0) {
      const peer = ArrayUtils.sampleOrThrow(peers)
      this.startSync(peer)
    }
  }

  startSync(peer: Peer): void {
    if (this.loader) {
      return
    }

    Assert.isNotNull(peer.sequence)
    Assert.isNotNull(peer.work)
    Assert.isNotNull(this.chain.head)

    this.logger.info(
      `Starting sync from ${peer.displayName}. work: +${(
        peer.work - this.chain.head.work
      ).toString()}, ours: ${this.chain.head.sequence.toString()}, theirs: ${peer.sequence.toString()}`,
    )

    this.state = 'syncing'
    this.loader = peer

    peer.onStateChanged.on(this.onPeerStateChanged)

    this.stopping = this.syncFrom(peer)
      .catch((error) => {
        if (error instanceof AbortSyncingError || this.loader !== peer) {
          return
        }

        this.logger.error(
          `Stopping sync from ${peer.displayName} due to ${ErrorUtils.renderError(
            error,
            true,
          )}`,
        )

        peer.close(error)
      })
      .then(() => {
        this.stopSync(peer)
      })
  }

  stopSync(peer: Peer): void {
    if (this.loader !== peer) {
      return
    }

    if (this.state === 'syncing') {
      this.state = 'idle'
    }

    peer.onStateChanged.off(this.onPeerStateChanged)

    this.loader = null
    this.stopping = null
  }

  async wait(): Promise<void> {
    await this.stopping
  }

  async syncFrom(peer: Peer): Promise<void> {
    Assert.isNotNull(peer.sequence)

    const { ancestor, sequence, requests } = await this.findAncestor(peer)
    this.abort(peer)

    this.logger.info(
      `Found peer ${peer.displayName} ancestor ${HashUtils.renderHash(
        ancestor,
      )}, syncing from ${sequence}${
        sequence !== peer.sequence
          ? ` -> ${String(peer.sequence)} (${peer.sequence - sequence})`
          : ''
      } after ${requests} requests`,
    )

    await this.syncBlocks(peer, ancestor, sequence)
  }

  /**
   * Find the sequence of the ancestor block between you and peer
   */
  async findAncestor(
    peer: Peer,
  ): Promise<{ sequence: number; ancestor: Buffer; requests: number }> {
    Assert.isNotNull(peer.head, 'peer.head')
    Assert.isNotNull(peer.sequence, 'peer.sequence')
    Assert.isNotNull(this.chain.head, 'chain.head')

    let requests = 0

    // If we only added the genesis block, we'll just start from there
    if (this.chain.head.sequence === GENESIS_BLOCK_SEQUENCE) {
      return {
        sequence: GENESIS_BLOCK_SEQUENCE,
        ancestor: this.chain.head.hash,
        requests: requests,
      }
    }

    const hasHash = async (
      hash: Buffer | null,
    ): Promise<{ found: boolean; local: BlockHeader | null }> => {
      if (hash === null) {
        return { found: false, local: null }
      }

      const header = await this.chain.getHeader(hash)
      if (!header) {
        return { found: false, local: null }
      }

      const found = await this.chain.isHeadChain(header)
      return { found: found, local: header }
    }

    // First we search linearly backwards in case we are on the main chain already
    const start = MathUtils.min(peer.sequence, this.chain.head.sequence)

    this.logger.info(
      `Finding ancestor using linear search on last ${LINEAR_ANCESTOR_SEARCH} blocks starting at ${HashUtils.renderHash(
        this.chain.head.hash,
      )} (${this.chain.head.sequence}) from peer ${peer.displayName} at ${peer.sequence}`,
    )

    for (let i = 0; i < LINEAR_ANCESTOR_SEARCH; ++i) {
      requests++

      const needle = start - i * 2
      const hashes = await this.peerNetwork.getBlockHashes(peer, needle, 1)
      if (!hashes.length) {
        continue
      }

      const hash = hashes[0]
      const { found, local } = await hasHash(hash)

      if (!found) {
        continue
      }

      if (local && local.sequence !== needle) {
        this.logger.warn(
          `Peer ${peer.displayName} sent invalid header for hash. Expected sequence ${needle} but got ${local.sequence}`,
        )

        peer.punish(BAN_SCORE.MAX, 'invalid header')
        this.abort(peer)
      }

      return {
        sequence: needle,
        ancestor: hash,
        requests: requests,
      }
    }

    // Then we try a binary search to fine the forking point between us and peer
    let ancestorHash: Buffer | null = null
    let ancestorSequence: number | null = null
    let lower = Number(GENESIS_BLOCK_SEQUENCE)
    let upper = Number(peer.sequence)

    this.logger.info(
      `Finding ancestor using binary search from ${peer.displayName}, lower: ${lower}, upper: ${upper}`,
    )

    while (lower <= upper) {
      requests++

      const start = BenchUtils.start()

      const needle = Math.floor((lower + upper) / 2)
      const hashes = await this.peerNetwork.getBlockHashes(peer, needle, 1)
      const remote = hashes.length === 1 ? hashes[0] : null

      const end = BenchUtils.end(start)

      const { found, local } = await hasHash(remote)

      this.logger.info(
        `Searched for ancestor from ${
          peer.displayName
        }, needle: ${needle}, lower: ${lower}, upper: ${upper}, hash: ${HashUtils.renderHash(
          remote,
        )}, time: ${end.toFixed(2)}ms: ${found ? 'HIT' : 'MISS'}`,
      )

      if (!found) {
        upper = needle - 1
        continue
      }

      if (local && local.sequence !== needle) {
        this.logger.warn(`Peer ${peer.displayName} sent invalid header for hash`)

        peer.punish(BAN_SCORE.MAX, 'header not match sequence')
        this.abort(peer)
      }

      ancestorHash = remote
      ancestorSequence = needle

      lower = needle + 1
    }

    Assert.isNotNull(ancestorHash)
    Assert.isNotNull(ancestorSequence)

    return {
      ancestor: ancestorHash,
      sequence: ancestorSequence,
      requests: requests,
    }
  }

  async syncBlocks(peer: Peer, head: Buffer | null, sequence: number): Promise<void> {
    this.abort(peer)

    let count = 0
    let skipped = 0

    while (head) {
      this.logger.info(
        `Requesting ${this.blocksPerMessage} blocks starting at ${HashUtils.renderHash(
          head,
        )} (${sequence}) from ${peer.displayName}`,
      )

      const [headBlock, ...blocks]: SerializedBlock[] = await this.peerNetwork.getBlocks(
        peer,
        head,
        this.blocksPerMessage + 1,
      )

      if (!headBlock) {
        peer.punish(BAN_SCORE.MAX, 'empty GetBlocks message')
      }

      this.abort(peer)

      for (const addBlock of blocks) {
        sequence += 1

        const { added, block } = await this.addBlock(peer, addBlock)
        this.abort(peer)

        if (block.header.sequence !== sequence) {
          this.logger.warn(
            `Peer ${peer.displayName} sent block out of sequence. Expected ${sequence} but got ${block.header.sequence}`,
          )

          peer.punish(BAN_SCORE.MAX, 'out of sequence')
          this.abort(peer)
          return
        }

        if (!peer.sequence || block.header.sequence > peer.sequence) {
          peer.sequence = block.header.sequence
          peer.head = block.header.hash
          peer.work = block.header.work
        }

        head = block.header.hash
        count += 1

        if (!added) {
          skipped += 1
        }
      }

      // They didn't send a full message so they have no more blocks
      if (blocks.length < this.blocksPerMessage) {
        break
      }

      this.abort(peer)
    }

    this.logger.info(
      `Finished syncing ${count} blocks from ${peer.displayName}` +
        (skipped ? `, skipped ${skipped}` : ''),
    )
  }

  async addBlock(
    peer: Peer,
    serialized: SerializedBlock,
  ): Promise<{
    added: boolean
    block: Block
    reason: VerificationResultReason | null
  }> {
    Assert.isNotNull(this.chain.head)

    const block = this.chain.strategy.blockSerde.deserialize(serialized)
    const { isAdded, reason, score } = await this.chain.addBlock(block)

    this.speed.add(1)

    if (reason === VerificationResultReason.ORPHAN) {
      this.logger.info(
        `Peer ${peer.displayName} sent orphan ${HashUtils.renderBlockHeaderHash(
          block.header,
        )} (${block.header.sequence}), syncing orphan chain.`,
      )

      if (!this.loader) {
        this.startSync(peer)
      }

      return { added: false, block, reason: VerificationResultReason.ORPHAN }
    }

    if (reason === VerificationResultReason.DUPLICATE) {
      return { added: false, block, reason: VerificationResultReason.DUPLICATE }
    }

    if (reason) {
      Assert.isNotNull(score)

      this.logger.warn(
        `Peer ${
          peer.displayName
        } sent an invalid block. score: ${score}, hash: ${HashUtils.renderHash(
          block.header.hash,
        )} (${Number(block.header.sequence)}), reason: ${reason}`,
      )

      peer.punish(score, reason)
      return { added: false, block, reason }
    }

    Assert.isTrue(isAdded)
    return { added: true, block, reason: reason || null }
  }

  async addNewBlock(peer: Peer, newBlock: SerializedBlock): Promise<boolean> {
    // We drop blocks when we are still initially syncing as they
    // will become loose blocks and we can't verify them
    if (!this.chain.synced && this.loader) {
      return false
    }

    if (whitelist.size && !whitelist.has(peer.name || '')) {
      return false
    }

    const seenAt = new Date()

    const { added, block } = await this.addBlock(peer, newBlock)

    if (!peer.sequence || block.header.sequence > peer.sequence) {
      peer.sequence = block.header.sequence
    }

    this.onGossip.emit(block)

    if (added) {
      this.telemetry.submitNewBlockSeen(block, seenAt)
    }

    return added
  }

  /**
   * Throws AbortSyncingError which safely stops the syncing
   * with a peer if we should no longer sync from this peer
   */
  protected abort(peer: Peer): void {
    if (this.loader !== peer) {
      throw new AbortSyncingError('abort syncing')
    }
  }

  /**
   * When the peer disconnects we use this to stop syncing from them
   */
  protected onPeerStateChanged = ({ peer, state }: { peer: Peer; state: PeerState }): void => {
    if (state.type !== 'CONNECTED') {
      this.logger.info(
        `Peer ${peer.displayName} disconnected (${peer.state.type}) while syncing.`,
      )

      this.stopSync(peer)
    }
  }
}
