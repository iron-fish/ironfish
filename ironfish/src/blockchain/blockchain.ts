/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset } from '@ironfish/rust-nodejs'
import LRU from 'blru'
import { BufferMap } from 'buffer-map'
import { Assert } from '../assert'
import { BlockHasher } from '../blockHasher'
import { Consensus } from '../consensus'
import { VerificationResultReason, Verifier } from '../consensus/verifier'
import { Event } from '../event'
import { Config } from '../fileStores'
import { FileSystem } from '../fileSystems'
import { createRootLogger, Logger } from '../logger'
import { MerkleTree, NoteHasher } from '../merkletree'
import { LeafEncoding } from '../merkletree/database/leaves'
import { NodeEncoding } from '../merkletree/database/nodes'
import { MetricsMonitor } from '../metrics'
import { RollingAverage } from '../metrics/rollingAverage'
import { BAN_SCORE } from '../network/peers/peer'
import { Network } from '../networks/network'
import {
  Block,
  BlockSerde,
  GENESIS_BLOCK_PREVIOUS,
  GENESIS_BLOCK_SEQUENCE,
  RawBlock,
  SerializedBlock,
} from '../primitives/block'
import {
  BlockHash,
  BlockHeader,
  isBlockHeavier,
  isBlockLater,
  RawBlockHeader,
  transactionCommitment,
} from '../primitives/blockheader'
import {
  NoteEncrypted,
  NoteEncryptedHash,
  SerializedNoteEncrypted,
  SerializedNoteEncryptedHash,
} from '../primitives/noteEncrypted'
import { Target } from '../primitives/target'
import { Transaction, TransactionHash } from '../primitives/transaction'
import { BUFFER_ENCODING, IDatabaseTransaction } from '../storage'
import { AsyncUtils, BenchUtils, HashUtils } from '../utils'
import { WorkerPool } from '../workerPool'
import { AssetValue } from './database/assetValue'
import { BlockchainDB } from './database/blockchaindb'
import { TransactionsValue } from './database/transactions'
import { NullifierSet } from './nullifierSet/nullifierSet'

export const VERSION_DATABASE_CHAIN = 28

export class Blockchain {
  logger: Logger
  verifier: Verifier
  metrics: MetricsMonitor
  location: string
  files: FileSystem
  consensus: Consensus
  seedGenesisBlock: SerializedBlock
  config: Config
  blockHasher: BlockHasher
  workerPool: WorkerPool
  network: Network
  readonly blockchainDb: BlockchainDB

  readonly notes: MerkleTree<
    NoteEncrypted,
    NoteEncryptedHash,
    SerializedNoteEncrypted,
    SerializedNoteEncryptedHash
  >

  readonly nullifiers: NullifierSet

  synced = false
  opened = false

  addSpeed: RollingAverage
  invalid: LRU<BlockHash, VerificationResultReason>
  orphans: LRU<BlockHash, BlockHeader>
  logAllBlockAdd: boolean
  // Whether to seed the chain with a genesis block when opening the database.
  autoSeed: boolean

  // When ever the blockchain becomes synced
  onSynced = new Event<[]>()
  // When ever a block is added to the heaviest chain and the trees have been updated
  onConnectBlock = new Event<[block: Block, tx?: IDatabaseTransaction]>()
  // When ever a block is removed from the heaviest chain, trees have not been updated yet
  onDisconnectBlock = new Event<[block: Block, tx?: IDatabaseTransaction]>()
  // When ever a block is added to a fork
  onForkBlock = new Event<[block: Block, tx?: IDatabaseTransaction]>()
  // When ever the blockchain is reorganized
  onReorganize = new Event<[oldHead: BlockHeader, newHead: BlockHeader, fork: BlockHeader]>()

  private _head: BlockHeader | null = null

  get head(): BlockHeader {
    Assert.isNotNull(
      this._head,
      'Blockchain.head should never be null. Is the chain database open?',
    )
    return this._head
  }
  set head(newHead: BlockHeader) {
    this._head = newHead
  }

  private _latestCheckpoint: BlockHeader | null = null

  get latestCheckpoint(): BlockHeader | null {
    return this._latestCheckpoint
  }

  private set latestCheckpoint(newCheckpoint: BlockHeader | null) {
    this._latestCheckpoint = newCheckpoint
  }

  private _latest: BlockHeader | null = null
  get latest(): BlockHeader {
    Assert.isNotNull(
      this._latest,
      'Blockchain.latest should never be null. Is the chain database open?',
    )
    return this._latest
  }
  set latest(newLatest: BlockHeader) {
    this._latest = newLatest
  }

  private _genesis: BlockHeader | null = null
  get genesis(): BlockHeader {
    Assert.isNotNull(
      this._genesis,
      'Blockchain.genesis should never be null. Is the chain database open?',
    )
    return this._genesis
  }
  set genesis(newGenesis: BlockHeader) {
    this._genesis = newGenesis
  }

  constructor(options: {
    location: string
    network: Network
    workerPool: WorkerPool
    logger?: Logger
    metrics?: MetricsMonitor
    logAllBlockAdd?: boolean
    autoSeed?: boolean
    files: FileSystem
    consensus: Consensus
    genesis: SerializedBlock
    config: Config
    blockHasher: BlockHasher
  }) {
    const logger = options.logger || createRootLogger()

    this.location = options.location
    this.network = options.network
    this.files = options.files
    this.logger = logger.withTag('blockchain')
    this.metrics = options.metrics || new MetricsMonitor({ logger: this.logger })
    this.verifier = new Verifier(this, options.workerPool)
    this.addSpeed = new RollingAverage(500)
    this.invalid = new LRU(100, null, BufferMap)
    this.orphans = new LRU(100, null, BufferMap)
    this.logAllBlockAdd = options.logAllBlockAdd || false
    this.autoSeed = options.autoSeed ?? true
    this.consensus = options.consensus
    this.seedGenesisBlock = options.genesis
    this.config = options.config
    this.blockHasher = options.blockHasher
    this.workerPool = options.workerPool

    this.blockchainDb = new BlockchainDB({
      files: options.files,
      location: options.location,
    })

    this.notes = new MerkleTree({
      hasher: new NoteHasher(),
      leafIndexKeyEncoding: BUFFER_ENCODING,
      leafEncoding: new LeafEncoding(),
      nodeEncoding: new NodeEncoding(),
      db: this.blockchainDb.db,
      name: 'n',
      depth: 32,
      defaultValue: Buffer.alloc(32),
    })

    this.nullifiers = new NullifierSet({ db: this.blockchainDb.db, name: 'u' })
  }

  get isEmpty(): boolean {
    return !this._head
  }

  get hasGenesisBlock(): boolean {
    return !!this._genesis
  }

  getProgress(): number {
    const start = this.genesis.timestamp.valueOf()
    const current = this.head.timestamp.valueOf()
    const end = Date.now()
    const offset = this.consensus.parameters.targetBlockTimeInSeconds * 4 * 1000

    const progress = (current - start) / (end - offset - start)

    return Math.max(Math.min(1, progress), 0)
  }

  private async seed(genesis: Block): Promise<BlockHeader> {
    const result = await this.addBlock(genesis)
    Assert.isTrue(result.isAdded, `Could not seed genesis: ${result.reason || 'unknown'}`)
    Assert.isEqual(result.isFork, false)

    const genesisHeader = await this.getHeaderAtSequence(GENESIS_BLOCK_SEQUENCE)
    Assert.isNotNull(
      genesisHeader,
      'Added the genesis block to the chain, but could not fetch the header',
    )

    return genesisHeader
  }

  async open(): Promise<void> {
    if (this.opened) {
      return
    }

    this.opened = true
    await this.blockchainDb.open()
    await this.load()
  }

  private async load(): Promise<void> {
    let genesisHeader = await this.getHeaderAtSequence(GENESIS_BLOCK_SEQUENCE)
    const seedGenesisBlock = BlockSerde.deserialize(this.seedGenesisBlock, this)

    if (genesisHeader) {
      Assert.isTrue(
        genesisHeader.hash.equals(seedGenesisBlock.header.hash),
        'Genesis block in network definition does not match existing chain genesis block',
      )
    }

    if (!genesisHeader && this.autoSeed) {
      genesisHeader = await this.seed(seedGenesisBlock)
    }

    if (genesisHeader) {
      this.genesis = genesisHeader
      this.head = this.genesis
      this.latest = this.genesis
    }

    const headHash = await this.blockchainDb.getMetaHash('head')
    if (headHash) {
      const head = await this.getHeader(headHash)
      Assert.isNotNull(
        head,
        `The blockchain meta table has a head hash of ${headHash.toString(
          'hex',
        )}, but no block header for that hash.`,
      )
      this.head = head
    }

    const latestHash = await this.blockchainDb.getMetaHash('latest')
    if (latestHash) {
      const latest = await this.getHeader(latestHash)
      Assert.isNotNull(
        latest,
        `The blockchain meta table has a latest hash of ${latestHash.toString(
          'hex',
        )}, but no block header for that hash.`,
      )
      this.latest = latest
    }

    for (const [sequence, hash] of this.consensus.checkpoints) {
      const header = await this.getHeaderAtSequence(sequence)
      const onMainChain = header && header.hash.equals(hash)

      if (!onMainChain) {
        continue
      }

      if (!this.latestCheckpoint || this.latestCheckpoint.sequence < sequence) {
        this.latestCheckpoint = header
      }
    }

    if (this._head) {
      this.updateSynced()
    }
  }

  async close(): Promise<void> {
    if (!this.opened) {
      return
    }

    this.opened = false
    await this.blockchainDb.close()
  }

  async addBlock(block: Block): Promise<{
    isAdded: boolean
    isFork: boolean | null
    reason: VerificationResultReason | null
    score: number | null
  }> {
    let connectResult = null
    try {
      connectResult = await this.blockchainDb.db.transaction(async (tx) => {
        if (!this.hasGenesisBlock && block.header.sequence === GENESIS_BLOCK_SEQUENCE) {
          return await this.connect(block, null, tx)
        }

        const invalid = this.isInvalid(block.header)
        if (invalid) {
          throw new VerifyError(invalid, BAN_SCORE.MAX)
        }

        const verify = this.verifier.verifyBlockHeader(block.header)
        if (!verify.valid) {
          Assert.isNotUndefined(verify.reason)
          throw new VerifyError(verify.reason, BAN_SCORE.MAX)
        }

        if (await this.hasBlock(block.header.hash, tx)) {
          throw new VerifyError(VerificationResultReason.DUPLICATE)
        }

        const previous = await this.getPrevious(block.header, tx)

        if (!previous) {
          this.addOrphan(block.header)

          throw new VerifyError(VerificationResultReason.ORPHAN)
        }

        const connectResult = await this.connect(block, previous, tx)

        this.resolveOrphans(block)

        return connectResult
      })
    } catch (e) {
      if (e instanceof VerifyError) {
        return { isAdded: false, isFork: null, reason: e.reason, score: e.score }
      }
      throw e
    }

    return { isAdded: true, isFork: connectResult.isFork, reason: null, score: null }
  }

  /**
   * This function will find the forking point of two blocks if it exists, or return null
   * If the same hash is specified, the same block will be returned. If one block is a linear
   * fast forward to the other with no forks, then the earlier block will be returned.
   *
   * @param fromHash the hash of the first block to find the fork for
   * @param toHash the hash of the second block to find the fork for
   * @param tx
   * @returns a BlockHeader if the fork point was found, or null if it was not
   */
  async findFork(
    headerA: BlockHeader | Block,
    headerB: BlockHeader | Block,
    tx?: IDatabaseTransaction,
  ): Promise<BlockHeader> {
    if (headerA instanceof Block) {
      headerA = headerA.header
    }
    if (headerB instanceof Block) {
      headerB = headerB.header
    }

    let [base, fork] =
      headerA.sequence < headerB.sequence ? [headerA, headerB] : [headerB, headerA]

    if ((await this.isHeadChain(base, tx)) && (await this.isHeadChain(fork, tx))) {
      return base
    }

    while (!base.hash.equals(fork.hash)) {
      // Move
      while (fork.sequence > base.sequence) {
        const prev = await this.getPrevious(fork, tx)
        Assert.isNotNull(prev)
        fork = prev
      }

      if (base.hash.equals(fork.hash)) {
        break
      }

      const prev = await this.getPrevious(base, tx)
      Assert.isNotNull(prev)
      base = prev
    }

    return base
  }

  /**
   * Iterate the main chain from left to right inclusive.
   * Start and end being included in the yielded blocks.
   * */
  async *iterateTo(
    start: BlockHeader,
    end?: BlockHeader,
    tx?: IDatabaseTransaction,
    reachable = true,
  ): AsyncGenerator<BlockHeader, void, void> {
    let lastHeader: BlockHeader | null = null

    for await (const hash of this.iterateToHashes(start, end, tx, reachable)) {
      const header = await this.getHeader(hash, tx)
      Assert.isNotNull(header)

      // Checks that the main chain has not re-orged during iteration.
      // Read docs on iterateToHashes() for more information.
      if (lastHeader && !header.previousBlockHash.equals(lastHeader.hash)) {
        return
      }

      lastHeader = header
      yield header
    }
  }

  /**
   * This iterates the main chain from start (or genesis) to end (or the head).
   *
   * NOTE: Be warned that it's possible these hashes could change during a re-org and
   * "jump" chains. If you need safety, or are not sure what this means then you
   * should instead use Blockchain.iterateTo() instead.
   */
  async *iterateToHashes(
    start: BlockHeader,
    end?: BlockHeader,
    tx?: IDatabaseTransaction,
    reachable = true,
  ): AsyncGenerator<BlockHash, void, void> {
    let current = start.hash as BlockHash | null
    let last = null as BlockHash | null

    const max = end ? end.sequence - start.sequence + 1 : null
    let count = 0

    while (current) {
      count++
      yield current

      if (end && current.equals(end.hash)) {
        break
      }

      if (max !== null && count >= max) {
        break
      }

      last = current
      current = await this.getNextHash(current, tx)
    }

    if (reachable && end && !current?.equals(end.hash)) {
      throw new Error(
        'Failed to iterate between blocks on diverging forks:' +
          ` curr: ${HashUtils.renderHash(last)},` +
          ` end: ${HashUtils.renderHash(end.hash)},` +
          ` progress: ${count}/${String(max ?? '?')}`,
      )
    }
  }

  /**
   * Iterate the main chain from right to left inclusive.
   * Start and end being included in the yielded blocks.
   * */
  async *iterateFrom(
    start: BlockHeader,
    end?: BlockHeader,
    tx?: IDatabaseTransaction,
    reachable = true,
  ): AsyncGenerator<BlockHeader, void, void> {
    let current = start as BlockHeader | null
    const max = end ? start.sequence - end.sequence : null
    let count = 0

    while (current) {
      yield current

      if (end && current.hash.equals(end.hash)) {
        break
      }

      if (max !== null && count++ >= max) {
        break
      }

      current = await this.getPrevious(current, tx)
    }

    if (reachable && end && !current?.hash.equals(end.hash)) {
      throw new Error(
        'Failed to iterate between blocks on diverging forks:' +
          ` current: '${HashUtils.renderHash(current?.hash)}',` +
          ` current_sequence: '${Number(current?.sequence)}',` +
          ` end: '${HashUtils.renderHash(end.hash)}'`,
      )
    }
  }

  isInvalid(headerOrHash: BlockHeader | BlockHash): VerificationResultReason | null {
    const hash = Buffer.isBuffer(headerOrHash) ? headerOrHash : headerOrHash.hash

    const invalid = this.invalid.get(hash)
    if (invalid) {
      return invalid
    }

    if (!Buffer.isBuffer(headerOrHash) && this.invalid.has(headerOrHash.previousBlockHash)) {
      this.addInvalid(headerOrHash.hash, VerificationResultReason.INVALID_PARENT)
      return VerificationResultReason.INVALID_PARENT
    }

    return null
  }

  addInvalid(hash: BlockHash, reason: VerificationResultReason): void {
    this.invalid.set(hash, reason)
  }

  isCheckpoint(header: BlockHeader): boolean {
    return this.consensus.checkpoints.get(header.sequence)?.equals(header.hash) ?? false
  }

  private async connect(
    block: Block,
    prev: BlockHeader | null,
    tx: IDatabaseTransaction,
  ): Promise<{ isFork: boolean }> {
    const start = BenchUtils.start()

    const work = block.header.target.toDifficulty()
    block.header.work = (prev ? prev.work : BigInt(0)) + work

    let prevNoteSize = 0
    if (prev) {
      Assert.isNotNull(prev.noteSize)
      prevNoteSize = prev.noteSize
    }

    block.header.noteSize = prevNoteSize + block.counts().notes

    const isFork = !this.isEmpty && !isBlockHeavier(block.header, this.head)

    if (isFork) {
      await this.addForkToChain(block, prev, tx)
    } else {
      await this.addHeadToChain(block, prev, tx)
    }

    const addTime = BenchUtils.end(start)
    this.addSpeed.add(addTime)
    this.updateSynced()

    if (this.logAllBlockAdd || Number(block.header.sequence) % 20 === 0) {
      this.logger.info(
        'Added block' +
          ` seq: ${Number(block.header.sequence)},` +
          ` hash: ${HashUtils.renderHash(block.header.hash)},` +
          ` txs: ${block.transactions.length},` +
          ` progress: ${(this.getProgress() * 100).toFixed(2)}%,` +
          ` time: ${addTime.toFixed(1)}ms`,
      )
    }

    return { isFork: isFork }
  }

  async disconnect(block: Block, tx: IDatabaseTransaction): Promise<void> {
    Assert.isTrue(
      block.header.hash.equals(this.head.hash),
      `Cannot disconnect ${HashUtils.renderHash(
        block.header.hash,
      )} block that is not the current head ${HashUtils.renderHash(this.head.hash)}`,
    )

    Assert.isFalse(
      block.header.sequence === GENESIS_BLOCK_SEQUENCE,
      'You cannot disconnect the genesisBlock',
    )

    const prev = await this.getPrevious(block.header)
    Assert.isNotNull(prev)

    await this.saveDisconnect(block, prev, tx)

    this.head = prev

    await this.onDisconnectBlock.emitAsync(block, tx)
  }

  private async reconnect(block: Block, tx: IDatabaseTransaction): Promise<void> {
    Assert.isTrue(
      block.header.previousBlockHash.equals(this.head.hash),
      `Reconnecting block ${block.header.hash.toString('hex')} (${
        block.header.sequence
      }) does not go on current head ${this.head.hash.toString('hex')} (${
        this.head.sequence - 1
      }) expected ${block.header.previousBlockHash.toString('hex')} (${
        block.header.sequence - 1
      })`,
    )

    const prev = await this.getPrevious(block.header)
    Assert.isNotNull(prev)

    await this.saveConnect(block, prev, tx)
    await tx.update()
    this.notes.pastRootTxCommitted(tx)

    this.head = block.header
    if (this.isCheckpoint(block.header)) {
      this.latestCheckpoint = block.header
    }

    await this.onConnectBlock.emitAsync(block, tx)
  }

  private async addForkToChain(
    block: Block,
    prev: BlockHeader | null,
    tx: IDatabaseTransaction,
  ): Promise<void> {
    const verifyBlockAdd = this.verifier.verifyBlockAdd(block, prev).catch((_) => {
      return { valid: false, reason: VerificationResultReason.ERROR }
    })

    await this.saveBlock(block, prev, true, tx)

    const { valid, reason } = await verifyBlockAdd
    if (!valid) {
      Assert.isNotUndefined(reason)

      this.logger.warn(
        `Invalid block adding to fork ${HashUtils.renderHash(block.header.hash)} (${
          block.header.sequence
        }): ${reason}`,
      )

      this.addInvalid(block.header.hash, reason)

      throw new VerifyError(reason, BAN_SCORE.MAX)
    }

    await tx.update()
    this.notes.pastRootTxCommitted(tx)

    if (!this.hasGenesisBlock || isBlockLater(block.header, this.latest)) {
      this.latest = block.header
    }

    await this.onForkBlock.emitAsync(block, tx)

    this.logger.warn(
      'Added block to fork' +
        ` seq: ${block.header.sequence},` +
        ` head-seq: ${this.head.sequence || ''},` +
        ` hash: ${HashUtils.renderHash(block.header.hash)},` +
        ` head-hash: ${this.head.hash ? HashUtils.renderHash(this.head.hash) : ''},` +
        ` work: ${block.header.work},` +
        ` head-work: ${this.head.work || ''},` +
        ` work-diff: ${(this.head.work || BigInt(0)) - block.header.work}`,
    )
  }

  private async addHeadToChain(
    block: Block,
    prev: BlockHeader | null,
    tx: IDatabaseTransaction,
  ): Promise<void> {
    if (prev && !block.header.previousBlockHash.equals(this.head.hash)) {
      this.logger.warn(
        `Reorganizing chain from ${HashUtils.renderHash(this.head.hash)} (${
          this.head.sequence
        }) for ${HashUtils.renderHash(block.header.hash)} (${
          block.header.sequence
        }) on prev ${HashUtils.renderHash(block.header.previousBlockHash)} (${
          block.header.sequence - 1
        })`,
      )

      await this.reorganizeChain(prev, tx)
    }

    const verifyBlockAdd = this.verifier.verifyBlockAdd(block, prev).catch((_) => {
      return { valid: false, reason: VerificationResultReason.ERROR }
    })

    await this.saveBlock(block, prev, false, tx)

    const { valid, reason } = await verifyBlockAdd
    if (!valid) {
      Assert.isNotUndefined(reason)

      this.logger.warn(
        `Invalid block adding to head chain ${HashUtils.renderHash(block.header.hash)} (${
          block.header.sequence
        }): ${reason}`,
      )

      this.addInvalid(block.header.hash, reason)
      throw new VerifyError(reason, BAN_SCORE.MAX)
    }

    await tx.update()
    this.notes.pastRootTxCommitted(tx)

    if (!this.hasGenesisBlock || isBlockLater(block.header, this.latest)) {
      this.latest = block.header
    }

    this.head = block.header
    if (this.isCheckpoint(block.header)) {
      this.latestCheckpoint = block.header
    }

    if (block.header.sequence === GENESIS_BLOCK_SEQUENCE) {
      this.genesis = block.header
    }

    await this.onConnectBlock.emitAsync(block, tx)
  }

  /**
   * Disconnects all blocks on another fork, and reconnects blocks
   * on the new head chain before `head`
   */
  private async reorganizeChain(newHead: BlockHeader, tx: IDatabaseTransaction): Promise<void> {
    const oldHead = this.head
    Assert.isNotNull(oldHead, 'No genesis block with fork')

    // Step 0: Find the fork between the two heads
    const fork = await this.findFork(oldHead, newHead, tx)

    if (this.latestCheckpoint && fork.sequence < this.latestCheckpoint.sequence) {
      throw new VerifyError(VerificationResultReason.CHECKPOINT_REORG)
    }

    // Step 2: Collect all the blocks from the old head to the fork
    const removeIter = this.iterateFrom(oldHead, fork, tx)
    const removeHeaders = await AsyncUtils.materialize(removeIter)
    const removeBlocks = await Promise.all(
      removeHeaders
        .filter((h) => !h.hash.equals(fork.hash))
        .map(async (h) => {
          const block = await this.getBlock(h, tx)
          Assert.isNotNull(block)
          return block
        }),
    )

    // Step 3: Disconnect each block
    for (const block of removeBlocks) {
      await this.disconnect(block, tx)
    }

    // Step 3. Collect all the blocks from the fork to the new head
    const addIter = this.iterateFrom(newHead, fork, tx)
    const addHeaders = await AsyncUtils.materialize(addIter)
    const addBlocks = await Promise.all(
      addHeaders
        .filter((h) => !h.hash.equals(fork.hash))
        .reverse()
        .map(async (h) => {
          const block = await this.getBlock(h, tx)
          Assert.isNotNull(block)
          return block
        }),
    )

    // Step 4. Add the new blocks to the trees
    for (const block of addBlocks) {
      await this.reconnect(block, tx)
    }

    this.logger.warn(
      'Reorganized chain.' +
        ` blocks: ${oldHead.sequence - fork.sequence + (newHead.sequence - fork.sequence)},` +
        ` old: ${HashUtils.renderHash(oldHead.hash)} (${oldHead.sequence}),` +
        ` new: ${HashUtils.renderHash(newHead.hash)} (${newHead.sequence}),` +
        ` fork: ${HashUtils.renderHash(fork.hash)} (${fork.sequence})`,
    )

    this.onReorganize.emit(oldHead, newHead, fork)
  }

  addOrphan(header: BlockHeader): void {
    this.orphans.set(header.hash, header)
  }

  private resolveOrphans(block: Block): void {
    this.orphans.remove(block.header.hash)

    for (const [hash, { value: header }] of this.orphans.map.entries()) {
      if (header.previousBlockHash.equals(block.header.hash)) {
        this.orphans.remove(hash)
      }
    }
  }

  /**
   * Get the block with the given hash, if it exists.
   */
  async getBlock(
    hashOrHeader: BlockHash | BlockHeader,
    tx?: IDatabaseTransaction,
  ): Promise<Block | null> {
    const blockHeader = hashOrHeader instanceof BlockHeader ? hashOrHeader : null
    const blockHash = hashOrHeader instanceof BlockHeader ? hashOrHeader.hash : hashOrHeader

    return this.blockchainDb.db.withTransaction(tx, async (tx) => {
      const [header, transactions] = await Promise.all([
        blockHeader || this.blockchainDb.getBlockHeader(blockHash, tx),
        this.blockchainDb.getTransactions(blockHash, tx),
      ])

      if (!header && !transactions) {
        return null
      }

      if (!header || !transactions) {
        throw new Error(
          `DB has inconsistent state header/transaction state for ${blockHash.toString('hex')}`,
        )
      }

      return new Block(header, transactions.transactions)
    })
  }

  /**
   * Get the block on the main chain at the given sequence, if it exists.
   */
  async getBlockAtSequence(sequence: number, tx?: IDatabaseTransaction): Promise<Block | null> {
    return this.blockchainDb.db.withTransaction(tx, async (tx) => {
      const header = await this.blockchainDb.getBlockHeaderAtSequence(sequence)
      if (!header) {
        return null
      }

      const transactions = await this.blockchainDb.getTransactions(header.hash, tx)
      if (!transactions) {
        return null
      }

      return new Block(header, transactions.transactions)
    })
  }

  /**
   * Returns true if the blockchain has a block at the given hash
   */
  async hasBlock(hash: BlockHash, tx?: IDatabaseTransaction): Promise<boolean> {
    const header = await this.blockchainDb.getBlockHeader(hash, tx)
    return !!header
  }

  /**
   * Returns true if the blockchain has any blocks at the given sequence
   */
  async hasHashesAtSequence(sequence: number, tx?: IDatabaseTransaction): Promise<boolean> {
    const hashes = await this.getHashesAtSequence(sequence, tx)

    if (!hashes) {
      return false
    }

    return hashes.length > 0
  }

  /**
   * Returns an array of hashes for any blocks at the given sequence
   */
  async getHashesAtSequence(sequence: number, tx?: IDatabaseTransaction): Promise<BlockHash[]> {
    return this.blockchainDb.getBlockHashesAtSequence(sequence, tx)
  }

  async putTransaction(
    hash: Buffer,
    value: TransactionsValue,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    return this.blockchainDb.putTransaction(hash, value, tx)
  }

  async clearSequenceToHash(tx?: IDatabaseTransaction): Promise<void> {
    return this.blockchainDb.clearSequenceToHash(tx)
  }

  async putSequenceToHash(
    sequence: number,
    hash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    return this.blockchainDb.putSequenceToHash(sequence, hash, tx)
  }

  /**
   * Create a new block on the chain.
   *
   * When 'verifyBlock' is set, excluding the randomness, the new block is guaranteed
   * to be valid with the current state of the chain. If the chain's head does
   * not change, then the new block can be added to the chain, once its
   * randomness is set to something that meets the target of the chain.
   *
   * After calling this function, the chain itself remains unchanged. No notes
   * or nullifiers have been added to the tree, and no blocks have been added
   * to the chain, including the newly minted one.
   */
  async newBlock(
    userTransactions: Transaction[],
    minersFee: Transaction,
    graffiti?: Buffer,
    previous?: BlockHeader,
    verifyBlock = true,
  ): Promise<Block> {
    const transactions = [minersFee, ...userTransactions]

    return await this.blockchainDb.db.transaction(async (tx) => {
      const startTime = BenchUtils.start()

      let previousBlockHash
      let previousSequence
      let target
      let timestamp
      const currentTime = Date.now()

      const originalNoteSize = await this.notes.size(tx)

      if (!this.hasGenesisBlock) {
        previousBlockHash = GENESIS_BLOCK_PREVIOUS
        previousSequence = 0
        target = Target.maxTarget()
        timestamp = new Date(currentTime)
      } else {
        const heaviestHead = this.head

        // Sanity check that we are building on top of correct size note tree, may not be needed
        Assert.isEqual(originalNoteSize, heaviestHead.noteSize, 'newBlock note size mismatch')

        previousBlockHash = heaviestHead.hash
        previousSequence = heaviestHead.sequence
        const previousHeader = await this.getHeader(heaviestHead.previousBlockHash, tx)
        if (!previousHeader && previousSequence !== 1) {
          throw new Error('There is no previous block to calculate a target')
        }

        if (previous && !previous.hash.equals(previousBlockHash)) {
          throw new HeadChangedError(`Can't create a block not attached to the chain head`)
        }

        timestamp = new Date(Math.max(currentTime, heaviestHead.timestamp.getTime() + 1))

        target = Target.calculateTarget(
          this.consensus,
          previousSequence + 1,
          timestamp,
          heaviestHead.timestamp,
          heaviestHead.target,
        )
      }

      const blockNotes = []
      for (const transaction of transactions) {
        for (const note of transaction.notes) {
          blockNotes.push(note)
        }
      }

      await this.notes.addBatch(blockNotes, tx)

      const noteCommitment = await this.notes.rootHash(tx)
      const noteSize = await this.notes.size(tx)

      graffiti = graffiti ? graffiti : Buffer.alloc(32)

      const rawHeader = {
        sequence: previousSequence + 1,
        previousBlockHash,
        noteCommitment,
        transactionCommitment: transactionCommitment(transactions),
        target,
        randomness: BigInt(0),
        timestamp,
        graffiti,
      }

      const header = this.newBlockHeaderFromRaw(rawHeader, noteSize, BigInt(0))

      const block = new Block(header, transactions)
      if (verifyBlock && !previousBlockHash.equals(GENESIS_BLOCK_PREVIOUS)) {
        // since we're creating a block that hasn't been mined yet, don't
        // verify target because it'll always fail target check here
        const verification = await this.verifier.verifyBlock(block, { verifyTarget: false })

        if (!verification.valid) {
          throw new Error(verification.reason)
        }
      }

      // abort this transaction as we've modified the trees just to get new
      // merkle roots, but this block isn't mined or accepted yet
      await tx.abort()

      this.metrics.chain_newBlock.add(BenchUtils.end(startTime))

      return block
    })
  }

  async getHeader(hash: BlockHash, tx?: IDatabaseTransaction): Promise<BlockHeader | null> {
    return (await this.blockchainDb.getBlockHeader(hash, tx)) || null
  }

  async getPrevious(
    header: BlockHeader,
    tx?: IDatabaseTransaction,
  ): Promise<BlockHeader | null> {
    return this.getHeader(header.previousBlockHash, tx)
  }

  async getNextHash(hash: BlockHash, tx?: IDatabaseTransaction): Promise<BlockHash | null> {
    const next = await this.blockchainDb.getNextHash(hash, tx)
    return next || null
  }

  /**
   * Gets the hash of the block at the sequence on the head chain
   */
  async getHashAtSequence(
    sequence: number,
    tx?: IDatabaseTransaction,
  ): Promise<BlockHash | null> {
    const hash = await this.blockchainDb.getBlockHashAtSequence(sequence, tx)
    return hash || null
  }

  async getBlockHashByTransactionHash(
    transactionHash: TransactionHash,
    tx?: IDatabaseTransaction,
  ): Promise<BlockHash | null> {
    const hash = await this.blockchainDb.getBlockHashByTransactionHash(transactionHash, tx)
    return hash || null
  }

  async transactionHashHasBlock(
    transactionHash: TransactionHash,
    tx?: IDatabaseTransaction,
  ): Promise<boolean> {
    return this.blockchainDb.transactionHashHasBlock(transactionHash, tx)
  }

  /**
   * Gets the header of the block at the sequence on the head chain
   */
  async getHeaderAtSequence(sequence: number): Promise<BlockHeader | null> {
    const hash = await this.blockchainDb.getBlockHashAtSequence(sequence)

    if (!hash) {
      return null
    }

    return this.getHeader(hash)
  }

  async getHeadersAtSequence(
    sequence: number,
    tx?: IDatabaseTransaction,
  ): Promise<BlockHeader[]> {
    return this.blockchainDb.getBlockHeadersAtSequence(sequence, tx)
  }

  async isHeadChain(header: BlockHeader, tx?: IDatabaseTransaction): Promise<boolean> {
    const hash = await this.getHashAtSequence(header.sequence, tx)

    if (!hash) {
      return false
    }

    return hash.equals(header.hash)
  }

  async getNext(header: BlockHeader, tx?: IDatabaseTransaction): Promise<BlockHeader | null> {
    const hash = await this.getNextHash(header.hash, tx)

    if (!hash) {
      return null
    }

    return this.getHeader(hash, tx)
  }

  async putNextHash(hash: Buffer, nextHash: Buffer, tx?: IDatabaseTransaction): Promise<void> {
    return this.blockchainDb.putNextHash(hash, nextHash, tx)
  }

  async clearHashToNextHash(tx?: IDatabaseTransaction): Promise<void> {
    return this.blockchainDb.clearHashToNextHash(tx)
  }

  async removeBlock(hash: Buffer): Promise<void> {
    await this.blockchainDb.db.transaction(async (tx) => {
      this.logger.debug(`Deleting block ${hash.toString('hex')}`)

      const exists = await this.hasBlock(hash, tx)

      if (!exists) {
        this.logger.debug(`No block exists at ${hash.toString('hex')}`)
        return
      }

      const header = await this.getHeader(hash, tx)
      Assert.isNotNull(header)

      const block = await this.getBlock(hash, tx)
      Assert.isNotNull(block)

      const main = await this.isHeadChain(header, tx)

      if (main && !this.head.hash.equals(hash)) {
        throw new Error(`Cannot remove main chain block that is not the head`)
      }

      const next = await this.getHeadersAtSequence(header.sequence + 1, tx)
      if (next && next.some((h) => h.previousBlockHash.equals(header.hash))) {
        throw new Error(`Cannot delete block when ${next.length} blocks are connected`)
      }

      if (this.head.hash.equals(hash)) {
        await this.disconnect(block, tx)
      }

      await this.blockchainDb.removeHashAtSequence(header.sequence, hash, tx)
      await this.blockchainDb.deleteTransaction(hash, tx)
      await this.blockchainDb.deleteHeader(hash, tx)

      // TODO: use a new heads table to recalculate this
      if (this.latest.hash.equals(hash)) {
        this.latest = this.head
        await this.blockchainDb.putMetaHash('latest', this.head.hash, tx)
      }
    })
  }

  /**
   * Iterates through block headers, starting from fromHash or the genesis block,
   * to toHash or the heaviest head.
   */
  async *iterateBlockHeaders(
    fromHash: Buffer | null = null,
    toHash: Buffer | null = null,
    tx?: IDatabaseTransaction,
    reachable = true,
  ): AsyncGenerator<BlockHeader, void, void> {
    let from: BlockHeader | null
    if (fromHash) {
      from = await this.getHeader(fromHash, tx)
    } else {
      from = this.genesis
    }

    let to: BlockHeader | null
    if (toHash) {
      to = await this.getHeader(toHash, tx)
    } else {
      to = this.head
    }

    Assert.isNotNull(from, `Expected 'from' not to be null`)
    Assert.isNotNull(to, `Expected 'to' not to be null`)

    for await (const header of this.iterateTo(from, to, tx, reachable)) {
      yield header
    }
  }

  async getBlockTransactions(
    header: BlockHeader,
    tx?: IDatabaseTransaction,
  ): Promise<
    {
      transaction: Transaction
      initialNoteIndex: number
      sequence: number
      blockHash: Buffer
      previousBlockHash: Buffer
      timestamp: Date
    }[]
  > {
    const block = await this.getBlock(header, tx)
    if (!block) {
      return []
    }

    Assert.isNotNull(header.noteSize)
    let noteIndex = header.noteSize

    const transactions = []
    // Transactions should be handled in reverse order because
    // header.noteCommitment is the size of the tree after the
    // last note in the block.
    for (const transaction of block.transactions.slice().reverse()) {
      noteIndex -= transaction.notes.length
      transactions.unshift({
        transaction,
        initialNoteIndex: noteIndex,
        blockHash: header.hash,
        sequence: header.sequence,
        previousBlockHash: header.previousBlockHash,
        timestamp: header.timestamp,
      })
    }

    return transactions
  }

  async saveConnect(
    block: Block,
    prev: BlockHeader | null,
    tx: IDatabaseTransaction,
  ): Promise<void> {
    const { valid, reason } = await this.verifier.verifyBlockConnect(block, tx)

    if (!valid) {
      Assert.isNotUndefined(reason)
      this.addInvalid(block.header.hash, reason)
      throw new VerifyError(reason, BAN_SCORE.MAX)
    }

    if (prev) {
      await this.blockchainDb.putNextHash(prev.hash, block.header.hash, tx)
    }

    await this.blockchainDb.putSequenceToHash(block.header.sequence, block.header.hash, tx)
    await this.blockchainDb.putMetaHash('head', block.header.hash, tx)

    // If the tree sizes don't match the previous block, we can't verify if the tree
    // sizes on this block are correct
    let prevNotesSize = 0
    if (prev) {
      Assert.isNotNull(prev.noteSize)
      prevNotesSize = prev.noteSize
    }

    Assert.isEqual(
      prevNotesSize,
      await this.notes.size(tx),
      'Notes tree must match previous block header',
    )

    await this.notes.addBatch(block.notes(), tx)
    await this.nullifiers.connectBlock(block, tx)

    for (const transaction of block.transactions) {
      await this.saveConnectedMintsToAssetsStore(transaction, tx)
      await this.saveConnectedBurnsToAssetsStore(transaction, tx)
      await this.blockchainDb.putTransactionHashToBlockHash(
        transaction.hash(),
        block.header.hash,
        tx,
      )
    }

    const verify = await this.verifier.verifyConnectedBlock(block, tx)

    if (!verify.valid) {
      Assert.isNotUndefined(verify.reason)
      this.addInvalid(block.header.hash, verify.reason)
      throw new VerifyError(verify.reason, BAN_SCORE.MAX)
    }
  }

  private async saveDisconnect(
    block: Block,
    prev: BlockHeader,
    tx: IDatabaseTransaction,
  ): Promise<void> {
    // Invert all the mints and burns that were applied from this block's transactions.
    // Iterate in reverse order to ensure changes are undone opposite from how
    // they were applied.
    for (const transaction of block.transactions.slice().reverse()) {
      await this.deleteDisconnectedBurnsFromAssetsStore(transaction, tx)
      await this.deleteDisconnectedMintsFromAssetsStore(transaction, tx)
      await this.blockchainDb.deleteTransactionHashToBlockHash(transaction.hash(), tx)
    }

    await this.blockchainDb.deleteNextHash(prev.hash, tx)
    await this.blockchainDb.deleteSequenceToHash(block.header.sequence, tx)

    Assert.isNotNull(prev.noteSize)

    await Promise.all([
      this.notes.truncate(prev.noteSize, tx),
      this.nullifiers.disconnectBlock(block, tx),
    ])

    await this.blockchainDb.putMetaHash('head', prev.hash, tx)

    await tx.update()
  }

  private async saveBlock(
    block: Block,
    prev: BlockHeader | null,
    fork: boolean,
    tx: IDatabaseTransaction,
  ): Promise<void> {
    const hash = block.header.hash
    const sequence = block.header.sequence

    // Update BlockHash -> BlockHeader
    await this.blockchainDb.putBlockHeader(hash, { header: block.header }, tx)

    // Update BlockHash -> Transaction
    await this.blockchainDb.addTransaction(hash, { transactions: block.transactions }, tx)

    // Update Sequence -> BlockHash[]
    await this.blockchainDb.addHashAtSequence(sequence, hash, tx)

    if (!fork) {
      await this.saveConnect(block, prev, tx)
    }

    if (!this.hasGenesisBlock || isBlockLater(block.header, this.latest)) {
      await this.blockchainDb.putMetaHash('latest', hash, tx)
    }
  }

  private async saveConnectedMintsToAssetsStore(
    transaction: Transaction,
    tx: IDatabaseTransaction,
  ): Promise<void> {
    for (const {
      asset,
      value,
      owner: currentOwner,
      transferOwnershipTo,
    } of transaction.mints) {
      const assetId = asset.id()
      const existingAsset = await this.blockchainDb.getAsset(assetId, tx)

      let createdTransactionHash = transaction.hash()
      let supply = BigInt(0)

      if (existingAsset) {
        createdTransactionHash = existingAsset.createdTransactionHash
        supply = existingAsset.supply
        Assert.bufferEquals(
          existingAsset.owner,
          currentOwner,
          'Stored owner does not match owner on the transaction',
        )
      }

      const updatedOwner = transferOwnershipTo || currentOwner

      await this.blockchainDb.putAsset(
        assetId,
        {
          createdTransactionHash,
          id: assetId,
          metadata: asset.metadata(),
          name: asset.name(),
          nonce: asset.nonce(),
          creator: asset.creator(),
          owner: updatedOwner,
          supply: supply + value,
        },
        tx,
      )
    }
  }

  private async saveConnectedBurnsToAssetsStore(
    transaction: Transaction,
    tx: IDatabaseTransaction,
  ): Promise<void> {
    for (const { assetId, value } of transaction.burns) {
      const existingAsset = await this.blockchainDb.getAsset(assetId, tx)
      Assert.isNotUndefined(existingAsset, 'Cannot burn undefined asset from the database')

      const existingSupply = existingAsset.supply
      const supply = existingSupply - value
      Assert.isTrue(supply >= BigInt(0), 'Invalid burn value')

      await this.blockchainDb.putAsset(
        assetId,
        {
          createdTransactionHash: existingAsset.createdTransactionHash,
          id: existingAsset.id,
          metadata: existingAsset.metadata,
          name: existingAsset.name,
          nonce: existingAsset.nonce,
          creator: existingAsset.creator,
          owner: existingAsset.owner,
          supply,
        },
        tx,
      )
    }
  }

  private async deleteDisconnectedBurnsFromAssetsStore(
    transaction: Transaction,
    tx: IDatabaseTransaction,
  ): Promise<void> {
    for (const { assetId, value } of transaction.burns.slice().reverse()) {
      const existingAsset = await this.blockchainDb.getAsset(assetId, tx)
      Assert.isNotUndefined(existingAsset)

      const existingSupply = existingAsset.supply
      const supply = existingSupply + value

      await this.blockchainDb.putAsset(
        assetId,
        {
          createdTransactionHash: existingAsset.createdTransactionHash,
          id: existingAsset.id,
          metadata: existingAsset.metadata,
          name: existingAsset.name,
          nonce: existingAsset.nonce,
          creator: existingAsset.creator,
          owner: existingAsset.owner,
          supply,
        },
        tx,
      )
    }
  }

  private async deleteDisconnectedMintsFromAssetsStore(
    transaction: Transaction,
    tx: IDatabaseTransaction,
  ): Promise<void> {
    for (const { asset, value, owner: originalOwner, transferOwnershipTo } of transaction.mints
      .slice()
      .reverse()) {
      const assetId = asset.id()
      const updatedOwner = transferOwnershipTo || originalOwner
      const existingAsset = await this.blockchainDb.getAsset(assetId, tx)
      Assert.isNotUndefined(existingAsset)
      Assert.bufferEquals(existingAsset.owner, updatedOwner)

      const existingSupply = existingAsset.supply
      const supply = existingSupply - value
      Assert.isTrue(supply >= BigInt(0))

      // If we are reverting the transaction which matches the created at
      // hash of the asset, delete the record from the store
      if (
        transaction.hash().equals(existingAsset.createdTransactionHash) &&
        supply === BigInt(0)
      ) {
        await this.blockchainDb.deleteAsset(assetId, tx)
      } else {
        await this.blockchainDb.putAsset(
          assetId,
          {
            createdTransactionHash: existingAsset.createdTransactionHash,
            id: asset.id(),
            metadata: asset.metadata(),
            name: asset.name(),
            nonce: asset.nonce(),
            creator: asset.creator(),
            owner: originalOwner,
            supply,
          },
          tx,
        )
      }
    }
  }

  private updateSynced(): void {
    if (this.synced) {
      return
    }

    const maxSyncedAgeMs =
      this.config.get('maxSyncedAgeBlocks') *
      this.consensus.parameters.targetBlockTimeInSeconds *
      1000
    if (this.head.timestamp.valueOf() < Date.now() - maxSyncedAgeMs) {
      return
    }

    this.synced = true
    this.onSynced.emit()
  }

  async getAssetById(assetId: Buffer, tx?: IDatabaseTransaction): Promise<AssetValue | null> {
    if (Asset.nativeId().equals(assetId)) {
      return {
        createdTransactionHash: GENESIS_BLOCK_PREVIOUS,
        id: Asset.nativeId(),
        metadata: Buffer.from('Native asset of Iron Fish blockchain', 'utf8'),
        name: Buffer.from('$IRON', 'utf8'),
        nonce: 0,
        creator: Buffer.from('Iron Fish', 'utf8'),
        owner: Buffer.from('Iron Fish', 'utf8'),
        supply: 0n,
      }
    }

    const asset = await this.blockchainDb.getAsset(assetId, tx)
    return asset || null
  }

  /**
   * Create the miner's fee transaction for a given block.
   *
   * The miner's fee is a special transaction with one output and
   * zero spends. Its output value must be the total transaction fees
   * in the block plus the mining reward for the block.
   *
   * The mining reward may change over time, so we accept the block sequence
   * to calculate the mining reward from.
   *
   * @param totalTransactionFees is the sum of the transaction fees intended to go
   * in this block.
   * @param blockSequence the sequence of the block for which the miner's fee is being created
   * @param minerKey the spending key for the miner.
   */
  async createMinersFee(
    totalTransactionFees: bigint,
    blockSequence: number,
    minerSpendKey: string,
  ): Promise<Transaction> {
    // Create a new note with value equal to the inverse of the sum of the
    // transaction fees and the mining reward
    const reward = this.network.miningReward(blockSequence)
    const amount = totalTransactionFees + BigInt(reward)

    const transactionVersion = this.consensus.getActiveTransactionVersion(blockSequence)
    return this.workerPool.createMinersFee(
      minerSpendKey,
      amount,
      Buffer.alloc(0),
      transactionVersion,
    )
  }

  newBlockHeaderFromRaw(
    raw: RawBlockHeader,
    noteSize?: number | null,
    work?: bigint,
  ): BlockHeader {
    const hash = this.blockHasher.hashHeader(raw)
    return new BlockHeader(raw, hash, noteSize, work)
  }

  newBlockFromRaw(raw: RawBlock, noteSize?: number | null, work?: bigint): Block {
    const header = this.newBlockHeaderFromRaw(raw.header, noteSize, work)
    return new Block(header, raw.transactions)
  }
}

export class VerifyError extends Error {
  name = this.constructor.name
  reason: VerificationResultReason
  score: number

  constructor(reason: VerificationResultReason, score = 0) {
    super(reason)

    this.reason = reason
    this.score = score
  }
}

export class HeadChangedError extends Error {
  name = this.constructor.name
}
