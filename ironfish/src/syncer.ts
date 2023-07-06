/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert } from './assert'
import { Blockchain } from './blockchain'
import { VerificationResultReason } from './consensus'
import { createRootLogger, Logger } from './logger'
import { Meter, MetricsMonitor } from './metrics'
import { RollingAverage } from './metrics/rollingAverage'
import { Peer, PeerNetwork } from './network'
import { BAN_SCORE, PeerState } from './network/peers/peer'
import { Block, GENESIS_BLOCK_SEQUENCE } from './primitives/block'
import { BlockHeader } from './primitives/blockheader'
import { Telemetry } from './telemetry'
import { ErrorUtils, HashUtils, MathUtils, SetTimeoutToken } from './utils'
import { ArrayUtils } from './utils/array'

const SYNCER_TICK_MS = 10 * 1000
const LINEAR_ANCESTOR_SEARCH = 3
const REQUEST_BLOCKS_PER_MESSAGE = 20

class AbortSyncingError extends Error {
  name = this.constructor.name
}

export class Syncer {
  readonly peerNetwork: PeerNetwork
  readonly chain: Blockchain
  readonly metrics: MetricsMonitor
  readonly telemetry: Telemetry
  readonly logger: Logger
  readonly speed: Meter
  readonly downloadSpeed: RollingAverage

  state: 'stopped' | 'idle' | 'stopping' | 'syncing'
  stopping: Promise<void> | null
  eventLoopTimeout: SetTimeoutToken | null
  loader: Peer | null = null
  blocksPerMessage: number

  constructor(options: {
    peerNetwork: PeerNetwork
    chain: Blockchain
    telemetry: Telemetry
    metrics?: MetricsMonitor
    logger?: Logger
    blocksPerMessage?: number
  }) {
    const logger = options.logger || createRootLogger()

    this.peerNetwork = options.peerNetwork
    this.chain = options.chain
    this.logger = logger.withTag('syncer')
    this.telemetry = options.telemetry

    this.metrics = options.metrics || new MetricsMonitor({ logger: this.logger })

    this.state = 'stopped'
    this.speed = this.metrics.addMeter()
    this.downloadSpeed = new RollingAverage(5)
    this.stopping = null
    this.eventLoopTimeout = null

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

    if (this.eventLoopTimeout) {
      clearTimeout(this.eventLoopTimeout)
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

    this.eventLoopTimeout = setTimeout(() => this.eventLoop(), SYNCER_TICK_MS)
  }

  findPeer(): void {
    const head = this.chain.head

    if (!head) {
      return
    }

    // Find all allowed peers that have more work than we have
    const peers = this.peerNetwork.peerManager
      .getConnectedPeers()
      .filter((peer) => peer.features?.syncing && peer.work && peer.work > head.work)

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

    const work = peer.work ? ` work: +${(peer.work - this.chain.head.work).toString()},` : ''
    this.logger.info(
      `Starting sync from ${
        peer.displayName
      }.${work} ours: ${this.chain.head.sequence.toString()}, theirs: ${peer.sequence.toString()}`,
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

      const header = await this.chain.blockchainDb.getBlockHeader(hash)
      if (!header) {
        return { found: false, local: null }
      }

      const found = await this.chain.blockchainDb.isHeadChain(header)
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

      const { headers } = await this.peerNetwork.getBlockHeaders(peer, needle, 1)
      if (!headers.length) {
        continue
      }
      const hash = headers[0].hash

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

      const needle = Math.floor((lower + upper) / 2)

      const { headers, time } = await this.peerNetwork.getBlockHeaders(peer, needle, 1)
      const remote = headers.length === 1 ? headers[0].hash : null
      const reportedTime = time

      const { found, local } = await hasHash(remote)

      this.logger.info(
        `Searched for ancestor from ${
          peer.displayName
        }, needle: ${needle}, lower: ${lower}, upper: ${upper}, hash: ${HashUtils.renderHash(
          remote,
        )}, time: ${reportedTime.toFixed(2)}ms: ${found ? 'HIT' : 'MISS'}`,
      )

      if (!found) {
        if (needle === GENESIS_BLOCK_SEQUENCE) {
          this.logger.warn(
            `Peer ${peer.displayName} sent a genesis block hash that doesn't match our genesis block hash`,
          )

          peer.punish(BAN_SCORE.MAX, VerificationResultReason.INVALID_GENESIS_BLOCK)
          this.abort(peer)
        }

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

    Assert.isNotNull(ancestorSequence)
    Assert.isNotNull(ancestorHash)

    return {
      ancestor: ancestorHash,
      sequence: ancestorSequence,
      requests: requests,
    }
  }

  private async getBlocks(
    peer: Peer,
    sequence: number,
    start: Buffer,
    limit: number,
  ): Promise<
    { ok: true; blocks: Block[]; time: number; isMessageFull: boolean } | { ok: false }
  > {
    this.logger.info(
      `Requesting ${limit - 1} blocks starting at ${HashUtils.renderHash(
        start,
      )} (${sequence}) from ${peer.displayName}`,
    )

    return this.peerNetwork
      .getBlocks(peer, start, limit)
      .then((result): { ok: true; blocks: Block[]; time: number; isMessageFull: boolean } => {
        return { ok: true, ...result }
      })
      .catch((e) => {
        this.logger.warn(
          `Error while syncing from ${peer.displayName}: ${ErrorUtils.renderError(e)}`,
        )

        return { ok: false }
      })
  }

  async syncBlocks(peer: Peer, head: Buffer, sequence: number): Promise<void> {
    let currentHead = head
    let currentSequence = sequence

    let blocksPromise = this.getBlocks(
      peer,
      currentSequence,
      currentHead,
      this.blocksPerMessage + 1,
    )

    while (currentHead) {
      const blocksResult = await blocksPromise
      if (!blocksResult.ok) {
        peer.close()
        this.stopSync(peer)
        return
      }

      const {
        blocks: [headBlock, ...blocks],
        isMessageFull,
        time,
      } = blocksResult

      if (!headBlock) {
        peer.punish(BAN_SCORE.MAX, 'empty GetBlocks message')
      }

      this.downloadSpeed.add((blocks.length + 1) / (time / 1000))

      this.abort(peer)

      // If they sent a full message they have more blocks so
      // optimistically request the next batch
      if (isMessageFull) {
        const block = blocks.at(-1) || headBlock

        blocksPromise = this.getBlocks(
          peer,
          block.header.sequence,
          block.header.hash,
          this.blocksPerMessage + 1,
        )
      }

      for (const addBlock of blocks) {
        currentSequence += 1

        const { block } = await this.addBlock(peer, addBlock)
        this.abort(peer)

        if (block.header.sequence !== currentSequence) {
          this.logger.warn(
            `Peer ${peer.displayName} sent block out of sequence. Expected ${currentSequence} but got ${block.header.sequence}`,
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

        currentHead = block.header.hash
      }

      // They didn't send a full message so they have no more blocks
      if (!isMessageFull) {
        break
      }

      this.abort(peer)
    }

    this.logger.info(`Finished syncing from ${peer.displayName}`)
  }

  async addBlock(
    peer: Peer,
    block: Block,
  ): Promise<{
    added: boolean
    block: Block
    reason: VerificationResultReason | null
  }> {
    const { isAdded, reason, score } = await this.chain.addBlock(block)

    this.speed.add(1)

    if (reason === VerificationResultReason.ORPHAN) {
      this.logger.info(
        `Peer ${peer.displayName} sent orphan ${HashUtils.renderBlockHeaderHash(
          block.header,
        )} (${block.header.sequence})`,
      )

      if (!this.loader) {
        this.logger.info(`Syncing orphan chain from ${peer.displayName}`)
        this.startSync(peer)
      } else {
        this.logger.info(`Sync already in progress from ${this.loader.displayName}`)
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
