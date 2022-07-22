/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import LRU from 'blru'
import { BufferMap } from 'buffer-map'
import { Assert } from '../assert'
import {
  GENESIS_BLOCK_PREVIOUS,
  GENESIS_BLOCK_SEQUENCE,
  MAX_SYNCED_AGE_MS,
  TARGET_BLOCK_TIME_IN_SECONDS,
} from '../consensus'
import { VerificationResultReason, Verifier } from '../consensus/verifier'
import { Event } from '../event'
import { FileSystem } from '../fileSystems'
import { genesisBlockData } from '../genesis'
import { createRootLogger, Logger } from '../logger'
import { MerkleTree } from '../merkletree'
import { NoteLeafEncoding, NullifierLeafEncoding } from '../merkletree/database/leaves'
import { NodeEncoding } from '../merkletree/database/nodes'
import { Meter, MetricsMonitor } from '../metrics'
import { BAN_SCORE } from '../network/peers/peer'
import { Block, SerializedBlock } from '../primitives/block'
import { BlockHash, BlockHeader, isBlockHeavier, isBlockLater } from '../primitives/blockheader'
import {
  NoteEncrypted,
  NoteEncryptedHash,
  SerializedNoteEncrypted,
  SerializedNoteEncryptedHash,
} from '../primitives/noteEncrypted'
import { Nullifier, NullifierHash } from '../primitives/nullifier'
import { Target } from '../primitives/target'
import { Transaction } from '../primitives/transaction'
import { IJSON } from '../serde'
import {
  BUFFER_ENCODING,
  IDatabase,
  IDatabaseStore,
  IDatabaseTransaction,
  StringEncoding,
  U32_ENCODING,
} from '../storage'
import { createDB } from '../storage/utils'
import { Strategy } from '../strategy'
import { AsyncUtils, BenchUtils, HashUtils } from '../utils'
import { WorkerPool } from '../workerPool'
import { HeaderEncoding } from './database/headers'
import { SequenceToHashesValueEncoding } from './database/sequenceToHashes'
import { TransactionsValueEncoding } from './database/transactions'
import {
  HashToNextSchema,
  HeadersSchema,
  MetaSchema,
  SequenceToHashesSchema,
  SequenceToHashSchema,
  TransactionsSchema,
} from './schema'

const DATABASE_VERSION = 10

export class Blockchain {
  db: IDatabase
  logger: Logger
  strategy: Strategy
  verifier: Verifier
  metrics: MetricsMonitor
  location: string
  files: FileSystem

  synced = false
  opened = false
  notes: MerkleTree<
    NoteEncrypted,
    NoteEncryptedHash,
    SerializedNoteEncrypted,
    SerializedNoteEncryptedHash
  >
  nullifiers: MerkleTree<Nullifier, NullifierHash, string, string>

  addSpeed: Meter
  invalid: LRU<Buffer, VerificationResultReason>
  logAllBlockAdd: boolean
  // Whether to seed the chain with a genesis block when opening the database.
  autoSeed: boolean

  // Contains flat fields
  meta: IDatabaseStore<MetaSchema>
  // BlockHash -> BlockHeader
  headers: IDatabaseStore<HeadersSchema>
  // BlockHash -> BlockHeader
  transactions: IDatabaseStore<TransactionsSchema>
  // Sequence -> BlockHash[]
  sequenceToHashes: IDatabaseStore<SequenceToHashesSchema>
  // Sequence -> BlockHash
  sequenceToHash: IDatabaseStore<SequenceToHashSchema>
  // BlockHash -> BlockHash
  hashToNextHash: IDatabaseStore<HashToNextSchema>

  // When ever the blockchain becomes synced
  onSynced = new Event<[]>()
  // When ever a block is added to the heaviest chain and the trees have been updated
  onConnectBlock = new Event<[block: Block, tx?: IDatabaseTransaction]>()
  // When ever a block is removed from the heaviest chain, trees have not been updated yet
  onDisconnectBlock = new Event<[block: Block, tx?: IDatabaseTransaction]>()
  // When ever a block is added to a fork
  onForkBlock = new Event<[block: Block, tx?: IDatabaseTransaction]>()

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
    strategy: Strategy
    workerPool: WorkerPool
    logger?: Logger
    metrics?: MetricsMonitor
    logAllBlockAdd?: boolean
    autoSeed?: boolean
    files: FileSystem
  }) {
    const logger = options.logger || createRootLogger()

    this.location = options.location
    this.strategy = options.strategy
    this.files = options.files
    this.logger = logger.withTag('blockchain')
    this.metrics = options.metrics || new MetricsMonitor({ logger: this.logger })
    this.verifier = new Verifier(this, options.workerPool)
    this.db = createDB({ location: options.location })
    this.addSpeed = this.metrics.addMeter()
    this.invalid = new LRU(100, null, BufferMap)
    this.logAllBlockAdd = options.logAllBlockAdd || false
    this.autoSeed = options.autoSeed ?? true

    // Flat Fields
    this.meta = this.db.addStore({
      name: 'bm',
      keyEncoding: new StringEncoding<'head' | 'latest'>(),
      valueEncoding: BUFFER_ENCODING,
    })

    // BlockHash -> BlockHeader
    this.headers = this.db.addStore({
      name: 'bh',
      keyEncoding: BUFFER_ENCODING,
      valueEncoding: new HeaderEncoding(this.strategy),
    })

    // BlockHash -> Transaction[]
    this.transactions = this.db.addStore({
      name: 'bt',
      keyEncoding: BUFFER_ENCODING,
      valueEncoding: new TransactionsValueEncoding(),
    })

    // number -> BlockHash[]
    this.sequenceToHashes = this.db.addStore({
      name: 'bs',
      keyEncoding: U32_ENCODING,
      valueEncoding: new SequenceToHashesValueEncoding(),
    })

    // number -> BlockHash
    this.sequenceToHash = this.db.addStore({
      name: 'bS',
      keyEncoding: U32_ENCODING,
      valueEncoding: BUFFER_ENCODING,
    })

    this.hashToNextHash = this.db.addStore({
      name: 'bH',
      keyEncoding: BUFFER_ENCODING,
      valueEncoding: BUFFER_ENCODING,
    })

    this.notes = new MerkleTree({
      hasher: this.strategy.noteHasher,
      leafIndexKeyEncoding: BUFFER_ENCODING,
      leafEncoding: new NoteLeafEncoding(),
      nodeEncoding: new NodeEncoding(),
      db: this.db,
      name: 'n',
      depth: 32,
    })

    this.nullifiers = new MerkleTree({
      hasher: this.strategy.nullifierHasher,
      leafIndexKeyEncoding: BUFFER_ENCODING,
      leafEncoding: new NullifierLeafEncoding(),
      nodeEncoding: new NodeEncoding(),
      db: this.db,
      name: 'u',
      depth: 32,
    })
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
    const offset = TARGET_BLOCK_TIME_IN_SECONDS * 4 * 1000

    const progress = (current - start) / (end - offset - start)

    return Math.max(Math.min(1, progress), 0)
  }

  private async seed() {
    const serialized = IJSON.parse(genesisBlockData) as SerializedBlock
    const genesis = this.strategy.blockSerde.deserialize(serialized)

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

    await this.files.mkdir(this.location, { recursive: true })
    await this.db.open()
    await this.db.upgrade(DATABASE_VERSION)

    let genesisHeader = await this.getHeaderAtSequence(GENESIS_BLOCK_SEQUENCE)
    if (!genesisHeader && this.autoSeed) {
      genesisHeader = await this.seed()
    }

    if (genesisHeader) {
      this.genesis = genesisHeader
      this.head = this.genesis
      this.latest = this.genesis
    }

    const headHash = await this.meta.get('head')
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

    const latestHash = await this.meta.get('latest')
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

    if (this._head) {
      this.updateSynced()
    }
  }

  async close(): Promise<void> {
    if (!this.opened) {
      return
    }
    this.opened = false
    await this.db.close()
  }

  async addBlock(block: Block): Promise<{
    isAdded: boolean
    isFork: boolean | null
    reason: VerificationResultReason | null
    score: number | null
  }> {
    let connectResult = null
    try {
      connectResult = await this.db.transaction(async (tx) => {
        const hash = block.header.recomputeHash()

        if (!this.hasGenesisBlock && block.header.sequence === GENESIS_BLOCK_SEQUENCE) {
          return await this.connect(block, null, tx)
        }

        const invalid = this.isInvalid(block)
        if (invalid) {
          throw new VerifyError(invalid, BAN_SCORE.MAX)
        }

        const verify = this.verifier.verifyBlockHeader(block.header)
        if (!verify.valid) {
          Assert.isNotUndefined(verify.reason)
          throw new VerifyError(verify.reason, BAN_SCORE.MAX)
        }

        if (await this.hasBlock(hash, tx)) {
          throw new VerifyError(VerificationResultReason.DUPLICATE)
        }

        const previous = await this.getPrevious(block.header, tx)

        if (!previous) {
          this.addOrphan(block)

          throw new VerifyError(VerificationResultReason.ORPHAN)
        }

        const connectResult = await this.connect(block, previous, tx)

        await this.resolveOrphans(block)

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
  ): Promise<{
    fork: BlockHeader
    isLinear: boolean
  }> {
    if (headerA instanceof Block) {
      headerA = headerA.header
    }
    if (headerB instanceof Block) {
      headerB = headerB.header
    }

    let linear = true

    let [base, fork] =
      headerA.sequence < headerB.sequence ? [headerA, headerB] : [headerB, headerA]

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

      linear = false

      const prev = await this.getPrevious(base, tx)
      Assert.isNotNull(prev)
      base = prev
    }

    return { fork: base, isLinear: linear }
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

  isInvalid(block: Block): VerificationResultReason | null {
    const invalid = this.invalid.get(block.header.hash)
    if (invalid) {
      return invalid
    }

    if (this.invalid.has(block.header.previousBlockHash)) {
      this.addInvalid(block.header, VerificationResultReason.INVALID_PARENT)
      return VerificationResultReason.INVALID_PARENT
    }

    return null
  }

  addInvalid(header: BlockHeader, reason: VerificationResultReason): void {
    this.invalid.set(header.hash, reason)
  }

  private async connect(
    block: Block,
    prev: BlockHeader | null,
    tx: IDatabaseTransaction,
  ): Promise<{ isFork: boolean }> {
    const start = BenchUtils.start()

    const work = block.header.target.toDifficulty()
    block.header.work = (prev ? prev.work : BigInt(0)) + work

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

  private async disconnect(block: Block, tx: IDatabaseTransaction): Promise<void> {
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

    this.head = block.header
    await this.onConnectBlock.emitAsync(block, tx)
  }

  private async addForkToChain(
    block: Block,
    prev: BlockHeader | null,
    tx: IDatabaseTransaction,
  ): Promise<void> {
    const { valid, reason } = await this.verifier.verifyBlockAdd(block, prev)

    if (!valid) {
      Assert.isNotUndefined(reason)

      this.logger.warn(
        `Invalid block adding to fork ${HashUtils.renderHash(block.header.hash)} (${
          block.header.sequence
        }): ${reason}`,
      )

      this.addInvalid(block.header, reason)

      throw new VerifyError(reason, BAN_SCORE.MAX)
    }

    await this.saveBlock(block, prev, true, tx)
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

    const { valid, reason } = await this.verifier.verifyBlockAdd(block, prev)
    if (!valid) {
      Assert.isNotUndefined(reason)

      this.logger.warn(
        `Invalid block adding to head chain ${HashUtils.renderHash(block.header.hash)} (${
          block.header.sequence
        }): ${reason}`,
      )

      this.addInvalid(block.header, reason)
      throw new VerifyError(reason, BAN_SCORE.MAX)
    }

    await this.saveBlock(block, prev, false, tx)
    this.head = block.header

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
    const { fork } = await this.findFork(oldHead, newHead, tx)
    Assert.isNotNull(fork, 'No fork found')

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
  }

  private addOrphan(_block: Block): void {
    // TODO: not implemented yet
  }

  private async resolveOrphans(_block: Block): Promise<void> {
    // TODO: not implemented yet
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

    return this.db.withTransaction(tx, async (tx) => {
      const [header, transactions] = await Promise.all([
        blockHeader || this.headers.get(blockHash, tx).then((result) => result?.header),
        this.transactions.get(blockHash, tx),
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
   * Returns true if the blockchain has a block at the given hash
   */
  async hasBlock(hash: BlockHash, tx?: IDatabaseTransaction): Promise<boolean> {
    const header = await this.headers.get(hash, tx)
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
    const hashes = await this.sequenceToHashes.get(sequence, tx)

    if (!hashes) {
      return []
    }

    return hashes.hashes
  }

  /**
   * Create a new block on the chain.
   *
   * Excluding the randomness, the new block is guaranteed to be valid with
   * the current state of the chain. If the chain's head does not change,
   * then the new block can be added to the chain, once its randomness is
   * set to something that meets the target of the chain.
   *
   * After calling this function, the chain itself remains unchanged. No notes
   * or nullifiers have been added to the tree, and no blocks have been added
   * to the chain, including the newly minted one.
   */
  async newBlock(
    userTransactions: Transaction[],
    minersFee: Transaction,
    graffiti?: Buffer,
  ): Promise<Block> {
    const transactions = [minersFee, ...userTransactions]
    return await this.db.transaction(async (tx) => {
      const originalNoteSize = await this.notes.size(tx)
      const originalNullifierSize = await this.nullifiers.size(tx)

      let previousBlockHash
      let previousSequence
      let target
      const timestamp = new Date(Date.now())

      if (!this.hasGenesisBlock) {
        previousBlockHash = GENESIS_BLOCK_PREVIOUS
        previousSequence = 0
        target = Target.maxTarget()
      } else {
        const heaviestHead = this.head
        if (
          originalNoteSize !== heaviestHead.noteCommitment.size ||
          originalNullifierSize !== heaviestHead.nullifierCommitment.size
        ) {
          throw new Error(
            `Heaviest head has ${heaviestHead.noteCommitment.size} notes and ${heaviestHead.nullifierCommitment.size} nullifiers but tree has ${originalNoteSize} and ${originalNullifierSize} nullifiers`,
          )
        }
        previousBlockHash = heaviestHead.hash
        previousSequence = heaviestHead.sequence
        const previousHeader = await this.getHeader(heaviestHead.previousBlockHash, tx)
        if (!previousHeader && previousSequence !== 1) {
          throw new Error('There is no previous block to calculate a target')
        }
        target = Target.calculateTarget(timestamp, heaviestHead.timestamp, heaviestHead.target)
      }

      for (const transaction of transactions) {
        for (const note of transaction.notes()) {
          await this.notes.add(note, tx)
        }
        for (const spend of transaction.spends()) {
          await this.nullifiers.add(spend.nullifier, tx)
        }
      }

      const noteCommitment = {
        commitment: await this.notes.rootHash(tx),
        size: await this.notes.size(tx),
      }
      const nullifierCommitment = {
        commitment: await this.nullifiers.rootHash(tx),
        size: await this.nullifiers.size(tx),
      }

      graffiti = graffiti ? graffiti : Buffer.alloc(32)

      const header = new BlockHeader(
        this.strategy,
        previousSequence + 1,
        previousBlockHash,
        noteCommitment,
        nullifierCommitment,
        target,
        BigInt(0),
        timestamp,
        minersFee.fee(),
        graffiti,
      )

      const block = new Block(header, transactions)
      if (!previousBlockHash.equals(GENESIS_BLOCK_PREVIOUS)) {
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

      return block
    })
  }

  async addNote(index: number, note: NoteEncrypted, tx?: IDatabaseTransaction): Promise<void> {
    return this.db.withTransaction(tx, async (tx) => {
      const noteCount = await this.notes.size(tx)

      // do we have a note at this index already?
      if (index < noteCount) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const oldNote = (await this.notes.get(index, tx))!
        if (!this.strategy.noteSerde.equals(note, oldNote)) {
          const message = `Tried to insert a note, but a different note already there for position ${index}`
          this.logger.error(message)
          throw new Error(message)
        }
        return
      } else if (index > noteCount) {
        const message = `Can't insert a note at index ${index}. Merkle tree has a count of ${noteCount}`
        this.logger.error(message)
        throw new Error(message)
      }

      await this.notes.add(note, tx)
    })
  }

  async addNullifier(
    index: number,
    nullifier: Nullifier,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    return this.db.withTransaction(tx, async (tx) => {
      const nullifierCount = await this.nullifiers.size(tx)
      // do we have a nullifier at this index already?
      if (index < nullifierCount) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const oldNullifier = (await this.nullifiers.get(index, tx))!
        if (!this.strategy.nullifierHasher.elementSerde().equals(nullifier, oldNullifier)) {
          const message = `Tried to insert a nullifier, but a different nullifier already there for position ${index}`
          this.logger.error(message)
          throw new Error(message)
        }
        return
      } else if (index > nullifierCount) {
        const message = `Can't insert a nullifier at index ${index}. Merkle tree has a count of ${nullifierCount}`
        this.logger.error(message)
        throw new Error(message)
      }
      await this.nullifiers.add(nullifier, tx)
    })
  }

  async getHeader(hash: BlockHash, tx?: IDatabaseTransaction): Promise<BlockHeader | null> {
    return (await this.headers.get(hash, tx))?.header || null
  }

  async getPrevious(
    header: BlockHeader,
    tx?: IDatabaseTransaction,
  ): Promise<BlockHeader | null> {
    return this.getHeader(header.previousBlockHash, tx)
  }

  async getNextHash(hash: BlockHash, tx?: IDatabaseTransaction): Promise<BlockHash | null> {
    const next = await this.hashToNextHash.get(hash, tx)
    return next || null
  }

  /**
   * Gets the hash of the block at the sequence on the head chain
   */
  async getHashAtSequence(sequence: number): Promise<BlockHash | null> {
    const hash = await this.sequenceToHash.get(sequence)
    return hash || null
  }

  /**
   * Gets the header of the block at the sequence on the head chain
   */
  async getHeaderAtSequence(sequence: number): Promise<BlockHeader | null> {
    const hash = await this.sequenceToHash.get(sequence)

    if (!hash) {
      return null
    }

    return this.getHeader(hash)
  }

  async getHeadersAtSequence(
    sequence: number,
    tx?: IDatabaseTransaction,
  ): Promise<BlockHeader[]> {
    const hashes = await this.sequenceToHashes.get(sequence, tx)

    if (!hashes) {
      return []
    }

    const headers = await Promise.all(
      hashes.hashes.map(async (h) => {
        const header = await this.getHeader(h, tx)
        Assert.isNotNull(header)
        return header
      }),
    )

    return headers
  }

  async isHeadChain(header: BlockHeader): Promise<boolean> {
    const hash = await this.getHashAtSequence(header.sequence)

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

  async removeBlock(hash: Buffer): Promise<void> {
    this.logger.info(`Deleting block ${hash.toString('hex')}`)

    await this.db.transaction(async (tx) => {
      if (!(await this.hasBlock(hash, tx))) {
        this.logger.warn(`No block exists at ${hash.toString('hex')}`)
        return
      }

      const header = await this.getHeader(hash, tx)
      Assert.isNotNull(header)

      const block = await this.getBlock(hash, tx)
      Assert.isNotNull(block)

      const next = await this.getHeadersAtSequence(header.sequence + 1, tx)
      if (next && next.some((h) => h.previousBlockHash.equals(header.hash))) {
        throw new Error(`Cannot delete block when ${next.length} blocks are connected`)
      }

      if (this.head.hash.equals(hash)) {
        await this.disconnect(block, tx)
      }

      const result = await this.sequenceToHashes.get(header.sequence, tx)
      const hashes = (result?.hashes || []).filter((h) => !h.equals(hash))
      if (hashes.length === 0) {
        await this.sequenceToHashes.del(header.sequence, tx)
      } else {
        await this.sequenceToHashes.put(header.sequence, { hashes }, tx)
      }

      await this.transactions.del(hash, tx)
      await this.headers.del(hash, tx)

      // TODO: use a new heads table to recalculate this
      if (this.latest.hash.equals(hash)) {
        this.latest = this.head
        await this.meta.put('latest', this.head.hash, tx)
      }
    })
  }

  /**
   * Iterates through transactions, starting from fromHash or the genesis block,
   * to toHash or the heaviest head.
   */
  async *iterateTransactions(
    fromHash: Buffer | null = null,
    toHash: Buffer | null = null,
    tx?: IDatabaseTransaction,
    reachable = true,
  ): AsyncGenerator<
    {
      transaction: Transaction
      initialNoteIndex: number
      sequence: number
      blockHash: Buffer
      previousBlockHash: Buffer
    },
    void,
    unknown
  > {
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
      for await (const transaction of this.iterateBlockTransactions(header, tx)) {
        yield transaction
      }
    }
  }

  async *iterateBlockTransactions(
    header: BlockHeader,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<
    {
      transaction: Transaction
      initialNoteIndex: number
      sequence: number
      blockHash: Buffer
      previousBlockHash: Buffer
    },
    void,
    unknown
  > {
    const block = await this.getBlock(header, tx)

    if (!block) {
      return
    }

    let noteIndex = header.noteCommitment.size

    // Transactions should be handled in reverse order because
    // header.noteCommitment is the size of the tree after the
    // last note in the block.
    for (const transaction of block.transactions.reverse()) {
      noteIndex -= transaction.notesLength()

      yield {
        transaction,
        initialNoteIndex: noteIndex,
        blockHash: header.hash,
        sequence: header.sequence,
        previousBlockHash: header.previousBlockHash,
      }
    }
  }

  async saveConnect(
    block: Block,
    prev: BlockHeader | null,
    tx: IDatabaseTransaction,
  ): Promise<void> {
    // TODO: transaction goes here
    if (prev) {
      await this.hashToNextHash.put(prev.hash, block.header.hash, tx)
    }

    await this.sequenceToHash.put(block.header.sequence, block.header.hash, tx)
    await this.meta.put('head', block.header.hash, tx)

    let notesIndex = prev?.noteCommitment.size || 0
    let nullifierIndex = prev?.nullifierCommitment.size || 0

    for (const note of block.allNotes()) {
      await this.addNote(notesIndex, note, tx)
      notesIndex++
    }

    for (const spend of block.spends()) {
      await this.addNullifier(nullifierIndex, spend.nullifier, tx)
      nullifierIndex++
    }

    const verify = await this.verifier.verifyConnectedBlock(block, tx)

    if (!verify.valid) {
      Assert.isNotUndefined(verify.reason)
      this.addInvalid(block.header, verify.reason)
      throw new VerifyError(verify.reason, BAN_SCORE.MAX)
    }
  }

  private async saveDisconnect(
    block: Block,
    prev: BlockHeader,
    tx: IDatabaseTransaction,
  ): Promise<void> {
    // TODO: transaction goes here
    await this.hashToNextHash.del(prev.hash, tx)
    await this.sequenceToHash.del(block.header.sequence, tx)

    await Promise.all([
      this.notes.truncate(prev.noteCommitment.size, tx),
      this.nullifiers.truncate(prev.nullifierCommitment.size, tx),
    ])

    await this.meta.put('head', prev.hash, tx)

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
    await this.headers.put(hash, { header: block.header }, tx)

    // Update BlockHash -> Transaction
    await this.transactions.add(hash, { transactions: block.transactions }, tx)

    // Update Sequence -> BlockHash[]
    const hashes = await this.sequenceToHashes.get(sequence, tx)
    await this.sequenceToHashes.put(sequence, { hashes: [...(hashes?.hashes || []), hash] }, tx)

    if (!fork) {
      await this.saveConnect(block, prev, tx)
    }

    if (!this.hasGenesisBlock || isBlockLater(block.header, this.latest)) {
      this.latest = block.header
      await this.meta.put('latest', hash, tx)
    }

    await tx.update()
  }

  private updateSynced(): void {
    if (this.synced) {
      return
    }

    if (this.head.timestamp.valueOf() < Date.now() - MAX_SYNCED_AGE_MS) {
      return
    }

    this.synced = true
    this.onSynced.emit()
  }
}

export class VerifyError extends Error {
  reason: VerificationResultReason
  score: number

  constructor(reason: VerificationResultReason, score = 0) {
    super()

    this.reason = reason
    this.score = score
  }
}
