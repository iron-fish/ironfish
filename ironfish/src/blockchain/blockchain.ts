/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Strategy } from '../strategy'
import {
  IronfishTransaction,
  SerializedTransaction,
  Transaction,
} from '../primitives/transaction'
import { Block, SerializedBlock } from '../primitives/block'
import { Verifier, Validity, VerificationResultReason } from '../consensus/verifier'
import { BlockHeader, BlockHash, isBlockHeavier, isBlockLater } from '../primitives/blockheader'
import { IJSON, JsonSerializable } from '../serde'
import { Target } from '../primitives/target'
import { Meter, MetricsMonitor } from '../metrics'
import { Nullifier, NullifierHash } from '../primitives/nullifier'
import { Event } from '../event'
import {
  HeadersSchema,
  SCHEMA_VERSION,
  SequenceToHashesSchema,
  TransactionsSchema,
  SequenceToHashSchema,
  MetaSchema,
  HashToNextSchema,
} from './schema'
import {
  BIGINT_ENCODING,
  BUFFER_ARRAY_ENCODING,
  BUFFER_ENCODING,
  IDatabase,
  IDatabaseStore,
  IDatabaseTransaction,
  JsonEncoding,
  StringEncoding,
} from '../storage'
import { createRootLogger, Logger } from '../logger'
import {
  GENESIS_BLOCK_PREVIOUS,
  GENESIS_BLOCK_SEQUENCE,
  MAX_SYNCED_AGE_MS,
  TARGET_BLOCK_TIME_MS,
} from '../consensus'
import { MerkleTree } from '../merkletree'
import { Assert } from '../assert'
import { AsyncUtils, BenchUtils, HashUtils } from '../utils'
import {
  IronfishNoteEncrypted,
  SerializedWasmNoteEncrypted,
  SerializedWasmNoteEncryptedHash,
  WasmNoteEncryptedHash,
} from '../primitives/noteEncrypted'
import { createDB } from '../storage/utils'
import LRU from 'blru'
import { BufferMap } from 'buffer-map'
import { BlockHeaderEncoding, TransactionArrayEncoding } from './encoding'
import { BAN_SCORE } from '../network/peers/peer'
import { genesisBlockData } from '../genesis'
import { isThisSecond } from 'date-fns'
import { Mutex } from '../mutex'

export class Blockchain<
  E,
  H,
  T extends Transaction<E, H>,
  SE extends JsonSerializable,
  SH extends JsonSerializable,
  ST
> {
  db: IDatabase
  logger: Logger
  strategy: Strategy<E, H, T, SE, SH, ST>
  verifier: Verifier<E, H, T, SE, SH, ST>
  metrics: MetricsMonitor

  lock: Mutex
  synced = false
  opened = false
  notes: MerkleTree<E, H, SE, SH>
  nullifiers: MerkleTree<Nullifier, NullifierHash, string, string>

  private _head: BlockHeader<E, H, T, SE, SH, ST> | null = null
  get head(): BlockHeader<E, H, T, SE, SH, ST> {
    Assert.isNotNull(
      this._head,
      'Blockchain.head should never be null. Is the chain database open?',
    )
    return this._head
  }
  set head(newHead: BlockHeader<E, H, T, SE, SH, ST>) {
    this._head = newHead
  }

  private _latest: BlockHeader<E, H, T, SE, SH, ST> | null = null
  get latest(): BlockHeader<E, H, T, SE, SH, ST> {
    Assert.isNotNull(
      this._latest,
      'Blockchain.latest should never be null. Is the chain database open?',
    )
    return this._latest
  }
  set latest(newLatest: BlockHeader<E, H, T, SE, SH, ST>) {
    this._latest = newLatest
  }

  private _genesis: BlockHeader<E, H, T, SE, SH, ST> | null = null
  get genesis(): BlockHeader<E, H, T, SE, SH, ST> {
    Assert.isNotNull(
      this._genesis,
      'Blockchain.genesis should never be null. Is the chain database open?',
    )
    return this._genesis
  }
  set genesis(newGenesis: BlockHeader<E, H, T, SE, SH, ST>) {
    this._genesis = newGenesis
  }

  addSpeed: Meter
  invalid: LRU<Buffer, boolean>
  logAllBlockAdd: boolean
  // Whether to seed the chain with a genesis block when opening the database.
  autoSeed: boolean
  loadGenesisBlock: () => Promise<SerializedBlock<SH, ST>>

  // TODO: delete this, if anything ends up in here its an error to begin with
  looseNotes: { [key: number]: E }
  looseNullifiers: { [key: number]: Nullifier }

  // Contains flat fields
  meta: IDatabaseStore<MetaSchema>
  // BlockHash -> BlockHeader
  headers: IDatabaseStore<HeadersSchema<E, H, T, SE, SH, ST>>
  // BlockHash -> BlockHeader
  transactions: IDatabaseStore<TransactionsSchema<T>>
  // Sequence -> BlockHash[]
  sequenceToHashes: IDatabaseStore<SequenceToHashesSchema>
  // Sequence -> BlockHash
  sequenceToHash: IDatabaseStore<SequenceToHashSchema>
  // BlockHash -> BlockHash
  hashToNextHash: IDatabaseStore<HashToNextSchema>

  // When the heaviest head changes
  onHeadChange = new Event<[hash: BlockHash]>()
  // When ever the blockchain becomes synced
  onSynced = new Event<[]>()
  // When ever a block is added to the heaviest chain and the trees have been updated
  onConnectBlock = new Event<[block: Block<E, H, T, SE, SH, ST>, tx?: IDatabaseTransaction]>()
  // When ever a block is removed from the heaviest chain, trees have not been updated yet
  onDisconnectBlock = new Event<
    [block: Block<E, H, T, SE, SH, ST>, tx?: IDatabaseTransaction]
  >()

  constructor(options: {
    location: string
    strategy: Strategy<E, H, T, SE, SH, ST>
    logger?: Logger
    metrics?: MetricsMonitor
    logAllBlockAdd?: boolean
    autoSeed?: boolean
    loadGenesisBlock?: () => Promise<SerializedBlock<SH, ST>>
  }) {
    const logger = options.logger || createRootLogger()

    this.strategy = options.strategy
    this.logger = logger.withTag('blockchain')
    this.metrics = options.metrics || new MetricsMonitor(this.logger)
    this.verifier = this.strategy.createVerifier(this)
    this.db = createDB({ location: options.location })
    this.addSpeed = this.metrics.addMeter()
    this.invalid = new LRU(100, null, BufferMap)
    this.logAllBlockAdd = options.logAllBlockAdd || false
    this.autoSeed = options.autoSeed ?? true
    this.loadGenesisBlock = options.loadGenesisBlock ?? this.loadDefaultGenesisBlock
    this.lock = new Mutex()

    // TODO: Delete
    this.looseNotes = {}
    this.looseNullifiers = {}

    // Flat Fields
    this.meta = this.db.addStore({
      version: SCHEMA_VERSION,
      name: 'bm',
      keyEncoding: new StringEncoding<'head' | 'latest'>(),
      valueEncoding: new JsonEncoding<Buffer>(),
    })

    // BlockHash -> BlockHeader
    this.headers = this.db.addStore({
      version: SCHEMA_VERSION,
      name: 'bh',
      keyEncoding: BUFFER_ENCODING,
      valueEncoding: new BlockHeaderEncoding(this.strategy.blockHeaderSerde),
    })

    // BlockHash -> Transaction[]
    this.transactions = this.db.addStore({
      version: SCHEMA_VERSION,
      name: 'bt',
      keyEncoding: BUFFER_ENCODING,
      valueEncoding: new TransactionArrayEncoding(this.strategy.transactionSerde()),
    })

    // BigInt -> BlockHash[]
    this.sequenceToHashes = this.db.addStore({
      version: SCHEMA_VERSION,
      name: 'bs',
      keyEncoding: BIGINT_ENCODING,
      valueEncoding: BUFFER_ARRAY_ENCODING,
    })

    // BigInt -> BlockHash
    this.sequenceToHash = this.db.addStore({
      version: SCHEMA_VERSION,
      name: 'bS',
      keyEncoding: BIGINT_ENCODING,
      valueEncoding: BUFFER_ENCODING,
    })

    this.hashToNextHash = this.db.addStore({
      version: SCHEMA_VERSION,
      name: 'bH',
      keyEncoding: BUFFER_ENCODING,
      valueEncoding: BUFFER_ENCODING,
    })

    this.notes = new MerkleTree(this.strategy.noteHasher(), this.db, 'n', 32)
    this.nullifiers = new MerkleTree(this.strategy.nullifierHasher(), this.db, 'u', 32)
  }

  get isEmpty(): boolean {
    return !this._head
  }

  get hasGenesisBlock(): boolean {
    return !!this._genesis
  }

  get progress(): number {
    const start = this.genesis.timestamp.valueOf()
    const current = this.head.timestamp.valueOf()
    const end = Date.now()
    const offset = TARGET_BLOCK_TIME_MS * 4

    const progress = (current - start) / (end - offset - start)

    return Math.max(Math.min(1, progress), 0)
  }

  private loadDefaultGenesisBlock = () => {
    return Promise.resolve(IJSON.parse(genesisBlockData) as SerializedBlock<SH, ST>)
  }

  private async seed() {
    const serialized = await this.loadGenesisBlock()
    const genesis = this.strategy.blockSerde.deserialize(serialized)

    const result = await this.addBlock(genesis)
    Assert.isTrue(result.isAdded, `Could not seed genesis: ${result.reason || 'unknown'}`)

    const genesisHeader = await this.getHeaderAtSequence(GENESIS_BLOCK_SEQUENCE)
    Assert.isNotNull(
      genesisHeader,
      'Added the genesis block to the chain, but could not fetch the header',
    )

    return genesisHeader
  }

  async open(): Promise<void> {
    if (this.opened) return
    this.opened = true

    await this.db.open()

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
    if (!this.opened) return
    this.opened = false
    await this.db.close()
  }

  async addBlock(
    block: Block<E, H, T, SE, SH, ST>,
  ): Promise<{
    isAdded: boolean
    reason: VerificationResultReason | null
    score: number | null
  }> {
    const result = await this.lock.run(async () => {
      const hash = block.header.recomputeHash()

      if (!this.hasGenesisBlock && block.header.sequence === GENESIS_BLOCK_SEQUENCE) {
        return await this.connect(block, null)
      }

      if (this.isInvalid(block)) {
        return { isAdded: false, reason: VerificationResultReason.ERROR }
      }

      const verify = this.verifier.verifyBlockHeader(block.header)
      if (verify.valid !== Validity.Yes) {
        Assert.isNotUndefined(verify.reason)
        return { isAdded: false, reason: verify.reason }
      }

      if (await this.hasBlock(hash)) {
        return { isAdded: false, reason: VerificationResultReason.DUPLICATE }
      }

      const previous = await this.getPrevious(block.header)

      if (!previous) {
        this.addOrphan(block)
        return { isAdded: false, reason: VerificationResultReason.ORPHAN }
      }

      const result = await this.connect(block, previous)

      if (!result.isAdded) {
        return result
      }

      await this.resolveOrphans(block)

      return { isAdded: true, reason: null }
    })

    return { ...result, score: result.reason ? BAN_SCORE.MAX : BAN_SCORE.NO }
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
    headerA: BlockHeader<E, H, T, SE, SH, ST> | Block<E, H, T, SE, SH, ST>,
    headerB: BlockHeader<E, H, T, SE, SH, ST> | Block<E, H, T, SE, SH, ST>,
    tx?: IDatabaseTransaction,
  ): Promise<{ fork: BlockHeader<E, H, T, SE, SH, ST>; isLinear: boolean }> {
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

  async *iterateTo(
    start: BlockHeader<E, H, T, SE, SH, ST>,
    end?: BlockHeader<E, H, T, SE, SH, ST>,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<BlockHeader<E, H, T, SE, SH, ST>, void, void> {
    for await (const hash of this.iterateToHashes(start, end, tx)) {
      const header = await this.getHeader(hash, tx)
      Assert.isNotNull(header)
      yield header
    }
  }

  async *iterateToHashes(
    start: BlockHeader<E, H, T, SE, SH, ST>,
    end?: BlockHeader<E, H, T, SE, SH, ST>,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<BlockHash, void, void> {
    let current = start.hash as BlockHash | null
    const max = end ? end.sequence - start.sequence : null
    let count = 0

    while (current) {
      yield current

      if (end && current.equals(end.hash)) {
        break
      }

      if (max !== null && count++ >= max) {
        break
      }

      current = await this.getNextHash(current, tx)
    }

    if (end && !current?.equals(end.hash)) {
      throw new Error(
        'Failed to iterate between blocks on diverging forks:' +
          ` curr: ${HashUtils.renderHash(current)},` +
          ` end: ${HashUtils.renderHash(end.hash)},` +
          ` progress: ${count}/${String(max)}`,
      )
    }
  }

  async *iterateFrom(
    start: BlockHeader<E, H, T, SE, SH, ST>,
    end?: BlockHeader<E, H, T, SE, SH, ST>,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<BlockHeader<E, H, T, SE, SH, ST>, void, void> {
    let current = start as BlockHeader<E, H, T, SE, SH, ST> | null
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

    if (end && !current?.hash.equals(end.hash)) {
      throw new Error(
        'Failed to iterate between blocks on diverging forks:' +
          ` curr: ${HashUtils.renderHash(current?.hash)},` +
          ` end: ${HashUtils.renderHash(end.hash)}`,
      )
    }
  }

  isInvalid(block: Block<E, H, T, SE, SH, ST>): boolean {
    if (this.invalid.has(block.header.hash)) {
      return true
    }

    if (this.invalid.has(block.header.previousBlockHash)) {
      this.addInvalid(block.header)
      return true
    }

    return false
  }

  addInvalid(header: BlockHeader<E, H, T, SE, SH, ST>): void {
    this.invalid.set(header.hash, true)
  }

  private async connect(
    block: Block<E, H, T, SE, SH, ST>,
    prev: BlockHeader<E, H, T, SE, SH, ST> | null,
  ): Promise<{ isAdded: boolean; reason: VerificationResultReason | null }> {
    const start = BenchUtils.start()

    const work = block.header.target.toDifficulty()
    block.header.work = (prev ? prev.work : BigInt(0)) + work

    let result
    if (!this.isEmpty && !isBlockHeavier(block.header, this.head)) {
      result = await this.addForkToChain(block, prev)
    } else {
      result = await this.addHeadToChain(block, prev)
    }

    if (!result.isAdded) {
      return result
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
          ` progress: ${(this.progress * 100).toFixed(2)}%,` +
          ` time: ${addTime.toFixed(1)}ms`,
      )
    }

    return { isAdded: true, reason: null }
  }

  private async disconnect(block: Block<E, H, T, SE, SH, ST>): Promise<void> {
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

    await this.saveDisconnect(block, prev)

    this.head = prev

    await this.onDisconnectBlock.emitAsync(block)
  }

  private async reconnect(block: Block<E, H, T, SE, SH, ST>): Promise<void> {
    Assert.isTrue(
      block.header.previousBlockHash.equals(this.head.hash),
      `Reconnecting block ${block.header.hash.toString('hex')} (${
        block.header.sequence
      }) does not go on current head ${this.head.hash.toString('hex')} (${
        this.head.sequence - BigInt(1)
      }) expected ${block.header.previousBlockHash.toString('hex')} (${
        block.header.sequence - BigInt(1)
      })`,
    )

    const prev = await this.getPrevious(block.header)
    Assert.isNotNull(prev)

    await this.saveReconnect(block, prev)

    this.head = block.header
    await this.onConnectBlock.emitAsync(block)
  }

  private async addForkToChain(
    block: Block<E, H, T, SE, SH, ST>,
    prev: BlockHeader<E, H, T, SE, SH, ST> | null,
  ): Promise<{ isAdded: boolean; reason: VerificationResultReason | null }> {
    const { valid, reason } = await this.verifier.verifyBlockAdd(block, prev)
    if (valid !== Validity.Yes) {
      Assert.isNotUndefined(reason)

      this.logger.warn(
        `Invalid block adding to fork ${HashUtils.renderHash(block.header.hash)} (${
          block.header.sequence
        }): ${reason}`,
      )

      this.addInvalid(block.header)
      return { isAdded: false, reason: reason || null }
    }

    await this.saveBlock(block, prev, true)

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

    return { isAdded: true, reason: null }
  }

  private async addHeadToChain(
    block: Block<E, H, T, SE, SH, ST>,
    prev: BlockHeader<E, H, T, SE, SH, ST> | null,
  ): Promise<{ isAdded: boolean; reason: VerificationResultReason | null }> {
    if (prev && !block.header.previousBlockHash.equals(this.head.hash)) {
      this.logger.warn(
        `Reorganizing chain from ${HashUtils.renderHash(this.head.hash)} (${
          this.head.sequence
        }) for ${HashUtils.renderHash(block.header.hash)} (${
          block.header.sequence
        }) on prev ${HashUtils.renderHash(block.header.previousBlockHash)} (${
          block.header.sequence - BigInt(1)
        })`,
      )

      await this.reorganizeChain(prev)
    }

    const { valid, reason } = await this.verifier.verifyBlockAdd(block, prev)
    if (valid !== Validity.Yes) {
      Assert.isNotUndefined(reason)

      this.logger.warn(
        `Invalid block adding to head chain ${HashUtils.renderHash(block.header.hash)} (${
          block.header.sequence
        }): ${reason}`,
      )

      this.addInvalid(block.header)
      return { isAdded: false, reason: reason }
    }

    await this.saveBlock(block, prev, false)
    this.head = block.header

    if (block.header.sequence === GENESIS_BLOCK_SEQUENCE) {
      this.genesis = block.header
    }

    await this.onConnectBlock.emitAsync(block)

    return { isAdded: true, reason: null }
  }

  /**
   * Disconnects all blocks on another fork, and reconnects blocks
   * on the new head chain before `head`
   */
  private async reorganizeChain(newHead: BlockHeader<E, H, T, SE, SH, ST>): Promise<void> {
    const oldHead = this.head
    Assert.isNotNull(oldHead, 'No genesis block with fork')

    // Step 0: Find the fork between the two heads
    const { fork } = await this.findFork(oldHead, newHead)
    Assert.isNotNull(fork, 'No fork found')

    // Step 1: remove loose notes and loose nullifiers from queue as they are stale
    this.looseNotes = {}
    this.looseNullifiers = {}

    // Step 2: Collect all the blocks from the old head to the fork
    const removeIter = this.iterateFrom(oldHead, fork)
    const removeHeaders = await AsyncUtils.materialize(removeIter)
    const removeBlocks = await Promise.all(
      removeHeaders
        .filter((h) => !h.hash.equals(fork.hash))
        .map(async (h) => {
          const block = await this.getBlock(h)
          Assert.isNotNull(block)
          return block
        }),
    )

    // Step 3: Disconnect each block
    for (const block of removeBlocks) {
      await this.disconnect(block)
    }

    // Step 3. Collect all the blocks from the fork to the new head
    const addIter = this.iterateFrom(newHead, fork)
    const addHeaders = await AsyncUtils.materialize(addIter)
    const addBlocks = await Promise.all(
      addHeaders
        .filter((h) => !h.hash.equals(fork.hash))
        .reverse()
        .map(async (h) => {
          const block = await this.getBlock(h)
          Assert.isNotNull(block)
          return block
        }),
    )

    // Step 4. Add the new blocks to the trees
    for (const block of addBlocks) {
      await this.reconnect(block)
    }

    this.logger.warn(
      'Reorganized chain.' +
        ` blocks: ${oldHead.sequence - fork.sequence + (newHead.sequence - fork.sequence)},` +
        ` old: ${HashUtils.renderHash(oldHead.hash)} (${oldHead.sequence}),` +
        ` new: ${HashUtils.renderHash(newHead.hash)} (${newHead.sequence}),` +
        ` fork: ${HashUtils.renderHash(fork.hash)} (${fork.sequence})`,
    )
  }

  private addOrphan(_block: Block<E, H, T, SE, SH, ST>): void {
    // TODO: not implemented yet
  }

  private async resolveOrphans(_block: Block<E, H, T, SE, SH, ST>): Promise<void> {
    // TODO: not implemented yet
  }

  /**
   * Get the block with the given hash, if it exists.
   */
  async getBlock(
    hashOrHeader: BlockHash | BlockHeader<E, H, T, SE, SH, ST>,
    tx?: IDatabaseTransaction,
  ): Promise<Block<E, H, T, SE, SH, ST> | null> {
    const blockHeader = hashOrHeader instanceof BlockHeader ? hashOrHeader : null
    const blockHash = hashOrHeader instanceof BlockHeader ? hashOrHeader.hash : hashOrHeader

    return this.db.withTransaction(
      tx,
      [this.headers, this.transactions],
      'read',
      async (tx) => {
        const [header, transactions] = await Promise.all([
          blockHeader || this.headers.get(blockHash, tx),
          this.transactions.get(blockHash, tx),
        ])

        if (!header && !transactions) {
          return null
        }

        if (!header || !transactions) {
          throw new Error(
            `DB has inconsistent state header/transaction state for ${blockHash.toString(
              'hex',
            )}`,
          )
        }

        return new Block(header, transactions)
      },
    )
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
  async hasHashesAtSequence(sequence: bigint, tx?: IDatabaseTransaction): Promise<boolean> {
    const hashes = await this.getHashesAtSequence(sequence, tx)

    if (!hashes) {
      return false
    }

    return hashes.length > 0
  }

  /**
   * Returns an array of hashes for any blocks at the given sequence
   */
  async getHashesAtSequence(sequence: bigint, tx?: IDatabaseTransaction): Promise<BlockHash[]> {
    const hashes = await this.sequenceToHashes.get(sequence, tx)

    if (!hashes) {
      return []
    }

    return hashes
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
    userTransactions: T[],
    minersFee: T,
    graffiti?: Buffer,
  ): Promise<Block<E, H, T, SE, SH, ST>> {
    const transactions = userTransactions.concat([minersFee])

    return await this.lock.run(() => {
      return this.db.transaction(
        [
          ...this.notes.db.getStores(),
          ...this.nullifiers.db.getStores(),
          this.headers,
          this.transactions,
          this.sequenceToHashes,
        ],
        'readwrite',
        async (tx) => {
          const originalNoteSize = await this.notes.size(tx)
          const originalNullifierSize = await this.nullifiers.size(tx)

          let previousBlockHash
          let previousSequence
          let target
          const timestamp = new Date()

          if (!this.hasGenesisBlock) {
            previousBlockHash = GENESIS_BLOCK_PREVIOUS
            previousSequence = BigInt(0)
            target = Target.initialTarget()
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
            if (!previousHeader && previousSequence !== BigInt(1)) {
              throw new Error('There is no previous block to calculate a target')
            }
            target = Target.calculateTarget(
              timestamp,
              heaviestHead.timestamp,
              heaviestHead.target,
            )
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
            previousSequence + BigInt(1),
            previousBlockHash,
            noteCommitment,
            nullifierCommitment,
            target,
            0,
            timestamp,
            await minersFee.transactionFee(),
            graffiti,
          )

          const block = new Block(header, transactions)
          if (!previousBlockHash.equals(GENESIS_BLOCK_PREVIOUS)) {
            // since we're creating a block that hasn't been mined yet, don't
            // verify target because it'll always fail target check here
            const verification = await this.verifier.verifyBlock(block, { verifyTarget: false })

            if (verification.valid !== Validity.Yes) {
              throw new Error(verification.reason)
            }
          }

          // abort this transaction as we've modified the trees just to get new
          // merkle roots, but this block isn't mined or accepted yet
          await tx.abort()

          return block
        },
      )
    })
  }

  /**
   * Notes may come in any order, so its possible a given note is not
   * eligible to be added to the merkle tree yet. In this case, the note is
   * stored in self.looseNotes until the missing note arrives.
   */
  async addNote(index: number, note: E, tx?: IDatabaseTransaction): Promise<void> {
    return this.db.withTransaction(
      tx,
      [this.notes.counter, this.notes.leaves, this.notes.nodes],
      'readwrite',
      async (tx) => {
        let noteCount = await this.notes.size(tx)

        // do we have a note at this index already?
        if (index < noteCount) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const oldNote = (await this.notes.get(index, tx))!
          if (!this.strategy.noteSerde.equals(note, oldNote)) {
            this.logger.error(
              `Tried to insert a note, but a different note already there for position ${index}`,
            )
          }
          return
        }

        this.looseNotes[index] = note

        for (;;) {
          const note = this.looseNotes[noteCount]
          if (note) {
            await this.notes.add(note, tx)
            noteCount++
          } else {
            break
          }
        }

        // Garbage collecting. We keep notes in looseNotes after they are added
        // to deal with adding them back after truncation events,
        // but once the chain is large enough, the oldest notes are not likely to
        // be truncated. (Truncations happen at forks, which are typically near the head)
        // TODO replace with LRU cache
        const indexesToPrune = noteCount - 1000
        for (const index in this.looseNotes) {
          if (parseInt(index) < indexesToPrune) {
            delete this.looseNotes[index]
          }
        }
      },
    )
  }

  /**
   * Notes may come in any order, so its possible a given note is not
   * eligible to be added to the merkle tree yet. In this case, the note is
   * stored in self.looseNotes until the missing note arrives.
   */
  async addNullifier(
    index: number,
    nullifier: Nullifier,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    return this.db.withTransaction(
      tx,
      [this.nullifiers.counter, this.nullifiers.leaves, this.nullifiers.nodes],
      'readwrite',
      async (tx) => {
        let nullifierCount = await this.nullifiers.size(tx)
        // do we have a nullifier at this index already?
        if (index < nullifierCount) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const oldNullifier = (await this.nullifiers.get(index, tx))!
          if (!this.strategy.nullifierHasher().elementSerde().equals(nullifier, oldNullifier)) {
            this.logger.warn(
              `Tried to insert a nullifier, but a different nullifier already there for position ${index}`,
            )
            return
          }
        }
        this.looseNullifiers[index] = nullifier
        for (;;) {
          const nullifier = this.looseNullifiers[nullifierCount]
          if (nullifier) {
            await this.nullifiers.add(nullifier, tx)
            nullifierCount++
          } else {
            break
          }
        }
        // Garbage collecting. We keep nullifiers in looseNullifiers after they are added
        // to deal with adding them back after truncation events,
        // but once the chain is large enough, the oldest nullifiers are not likely to
        // be truncated. (Truncations happen at forks, which are typically near the head)
        // TODO replace with LRU cache
        const indexesToPrune = nullifierCount - 1000
        for (const index in this.looseNullifiers) {
          if (parseInt(index) < indexesToPrune) {
            delete this.looseNullifiers[index]
          }
        }
      },
    )
  }

  async getHeader(
    hash: BlockHash,
    tx?: IDatabaseTransaction,
  ): Promise<BlockHeader<E, H, T, SE, SH, ST> | null> {
    return (await this.headers.get(hash, tx)) || null
  }

  async getPrevious(
    header: BlockHeader<E, H, T, SE, SH, ST>,
    tx?: IDatabaseTransaction,
  ): Promise<BlockHeader<E, H, T, SE, SH, ST> | null> {
    return this.getHeader(header.previousBlockHash, tx)
  }

  async getNextHash(hash: BlockHash, tx?: IDatabaseTransaction): Promise<BlockHash | null> {
    const next = await this.hashToNextHash.get(hash, tx)
    return next || null
  }

  /**
   * Gets the hash of the block at the sequence on the head chain
   */
  async getHashAtSequence(sequence: bigint): Promise<BlockHash | null> {
    const hash = await this.sequenceToHash.get(sequence)
    return hash || null
  }

  /**
   * Gets the header of the block at the sequence on the head chain
   */
  async getHeaderAtSequence(
    sequence: bigint,
  ): Promise<BlockHeader<E, H, T, SE, SH, ST> | null> {
    const hash = await this.sequenceToHash.get(sequence)

    if (!hash) {
      return null
    }

    return this.getHeader(hash)
  }

  async getHeadersAtSequence(
    sequence: bigint,
    tx?: IDatabaseTransaction,
  ): Promise<BlockHeader<E, H, T, SE, SH, ST>[]> {
    const hashes = await this.sequenceToHashes.get(sequence, tx)

    if (!hashes) {
      return []
    }

    const headers = await Promise.all(
      hashes.map(async (h) => {
        const header = await this.getHeader(h, tx)
        Assert.isNotNull(header)
        return header
      }),
    )

    return headers
  }

  async isHeadChain(header: BlockHeader<E, H, T, SE, SH, ST>): Promise<boolean> {
    const hash = await this.getHashAtSequence(header.sequence)

    if (!hash) {
      return false
    }

    return hash.equals(header.hash)
  }

  async getNext(
    header: BlockHeader<E, H, T, SE, SH, ST>,
    tx?: IDatabaseTransaction,
  ): Promise<BlockHeader<E, H, T, SE, SH, ST> | null> {
    const hash = await this.getNextHash(header.hash, tx)

    if (!hash) {
      return null
    }

    return this.getHeader(hash, tx)
  }

  async removeBlock(hash: Buffer): Promise<void> {
    this.logger.info(`Deleting block ${hash.toString('hex')}`)

    await this.lock.run(() => {
      return this.db.transaction(this.db.getStores(), 'readwrite', async (tx) => {
        if (!(await this.hasBlock(hash, tx))) {
          this.logger.warn(`No block exists at ${hash.toString('hex')}`)
          return
        }

        const header = await this.getHeader(hash, tx)
        Assert.isNotNull(header)

        const block = await this.getBlock(hash, tx)
        Assert.isNotNull(block)

        const next = await this.getHeadersAtSequence(header.sequence + BigInt(1), tx)
        if (next && next.some((h) => h.previousBlockHash.equals(header.hash))) {
          throw new Error(`Cannot delete block when ${next.length} blocks are connected`)
        }

        if (this.head.hash.equals(hash)) {
          await this.disconnect(block)
        }

        let sequences = await this.sequenceToHashes.get(header.sequence, tx)
        sequences = (sequences || []).filter((h) => !h.equals(hash))
        if (sequences.length === 0) {
          await this.sequenceToHashes.del(header.sequence, tx)
        } else {
          await this.sequenceToHashes.put(header.sequence, sequences, tx)
        }

        await this.transactions.del(hash, tx)
        await this.headers.del(hash, tx)

        // TODO: use a new heads table to recalculate this
        if (this.latest.hash.equals(hash)) {
          this.latest = this.head
          await this.meta.put('latest', this.head.hash, tx)
        }
      })
    })
  }

  /**
   * Iterates through all transactions, starting from the heaviest head and walking backward.
   */
  async *iterateAllTransactions(
    fromBlockHash: Buffer | null = null,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<
    { transaction: T; initialNoteIndex: number; sequence: BigInt; blockHash: string },
    void,
    unknown
  > {
    let to: BlockHeader<E, H, T, SE, SH, ST> | null
    if (fromBlockHash) {
      to = await this.getHeader(fromBlockHash, tx)
    } else {
      to = this.head
    }

    if (!to) return

    for await (const header of this.iterateFrom(this.genesis, to, tx)) {
      for await (const transaction of this.iterateBlockTransactions(header, tx)) {
        yield transaction
      }
    }
  }

  async *iterateBlockTransactions(
    header: BlockHeader<E, H, T, SE, SH, ST>,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<
    { transaction: T; initialNoteIndex: number; sequence: BigInt; blockHash: string },
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
        blockHash: header.hash.toString('hex'),
        sequence: header.sequence,
      }
    }
  }

  async saveConnect(
    block: Block<E, H, T, SE, SH, ST>,
    prev: BlockHeader<E, H, T, SE, SH, ST> | null,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.db.withTransaction(tx, this.db.getStores(), 'readwrite', async (tx) => {
      let notesIndex = prev?.noteCommitment.size || 0
      let nullifierIndex = prev?.nullifierCommitment.size || 0

      await block.withTransactionReferences(async () => {
        for (const note of block.allNotes()) {
          await this.addNote(notesIndex, note, tx)
          notesIndex++
        }

        for (const spend of block.spends()) {
          await this.addNullifier(nullifierIndex, spend.nullifier, tx)
          nullifierIndex++
        }
      })
    })
  }

  private async saveReconnect(
    block: Block<E, H, T, SE, SH, ST>,
    prev: BlockHeader<E, H, T, SE, SH, ST>,
  ): Promise<void> {
    await this.db.transaction(this.db.getStores(), 'readwrite', async (tx) => {
      await this.hashToNextHash.put(prev.hash, block.header.hash, tx)
      await this.sequenceToHash.put(block.header.sequence, block.header.hash, tx)

      await this.saveConnect(block, prev, tx)
      await this.meta.put('head', prev.hash, tx)
    })
  }

  private async saveDisconnect(
    block: Block<E, H, T, SE, SH, ST>,
    prev: BlockHeader<E, H, T, SE, SH, ST>,
  ): Promise<void> {
    await this.db.transaction(this.db.getStores(), 'readwrite', async (tx) => {
      await this.hashToNextHash.del(prev.hash, tx)
      await this.sequenceToHash.del(block.header.sequence, tx)

      await Promise.all([
        this.notes.truncate(prev.noteCommitment.size, tx),
        this.nullifiers.truncate(prev.nullifierCommitment.size, tx),
      ])

      await this.meta.put('head', prev.hash, tx)
    })
  }

  private async saveBlock(
    block: Block<E, H, T, SE, SH, ST>,
    prev: BlockHeader<E, H, T, SE, SH, ST> | null,
    fork: boolean,
  ): Promise<void> {
    const hash = block.header.hash
    const sequence = block.header.sequence
    const prevHash = block.header.previousBlockHash

    let updateLatest = false

    await this.db.transaction(this.db.getStores(), 'readwrite', async (tx) => {
      // Update BlockHash -> BlockHeader
      await this.headers.put(hash, block.header, tx)

      // Update BlockHash -> Transaction
      await this.transactions.add(hash, block.transactions, tx)

      // Update Sequence -> BlockHash[]
      const hashes = await this.sequenceToHashes.get(sequence, tx)
      await this.sequenceToHashes.put(sequence, (hashes || []).concat(hash), tx)

      if (!fork) {
        await this.sequenceToHash.put(sequence, hash, tx)
        await this.hashToNextHash.put(prevHash, hash, tx)
        await this.meta.put('head', hash, tx)

        await this.saveConnect(block, prev, tx)
      }

      if (!this.hasGenesisBlock || isBlockLater(block.header, this.latest)) {
        updateLatest = true
        await this.meta.put('latest', hash, tx)
      }
    })

    if (updateLatest) {
      this.latest = block.header
    }
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

export type IronfishBlockchain = Blockchain<
  IronfishNoteEncrypted,
  WasmNoteEncryptedHash,
  IronfishTransaction,
  SerializedWasmNoteEncrypted,
  SerializedWasmNoteEncryptedHash,
  SerializedTransaction
>
