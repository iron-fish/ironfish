/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Strategy } from '../strategy'
import {
  IronfishTransaction,
  SerializedTransaction,
  Transaction,
} from '../primitives/transaction'
import { Block } from '../primitives/block'
import { Verifier, Validity, VerificationResultReason } from '../consensus/verifier'
import { BlockHeader, BlockHash } from '../primitives/blockheader'
import { BlockHashSerdeInstance, JsonSerializable } from '../serde'
import { Target } from '../primitives/target'
import { Graph } from './graph'
import { MetricsMonitor } from '../metrics'
import { Nullifier, NullifierHash } from '../primitives/nullifier'
import { Event } from '../event'
import {
  HeadersSchema,
  SCHEMA_VERSION,
  SequenceToHashSchema,
  TransactionsSchema,
  GraphSchema,
  HashToNextSchema,
} from './schema'
import {
  BufferArrayEncoding,
  BufferEncoding,
  IDatabase,
  IDatabaseStore,
  IDatabaseTransaction,
  JsonEncoding,
  SchemaValue,
  StringEncoding,
} from '../storage'
import { createRootLogger, Logger } from '../logger'
import { GENESIS_BLOCK_PREVIOUS, GENESIS_BLOCK_SEQUENCE, MAX_SYNCED_AGE_MS } from '../consensus'
import { MerkleTree } from '../merkletree'
import { Assert } from '../assert'
import { AsyncUtils } from '../utils'
import {
  IronfishNoteEncrypted,
  SerializedWasmNoteEncrypted,
  SerializedWasmNoteEncryptedHash,
  WasmNoteEncryptedHash,
} from '../primitives/noteEncrypted'
import { createDB } from '../storage/utils'

export const GRAPH_ID_NULL = 0

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

  synced = false
  opened = false
  notes: MerkleTree<E, H, SE, SH>
  nullifiers: MerkleTree<Nullifier, NullifierHash, string, string>
  genesisBlockHash: BlockHash | null
  genesisHeader: BlockHeader<E, H, T, SE, SH, ST> | null
  looseNotes: { [key: number]: E }
  looseNullifiers: { [key: number]: Nullifier }
  head: BlockHeader<E, H, T, SE, SH, ST> | null = null

  // BlockHash -> BlockHeader
  headers: IDatabaseStore<HeadersSchema<SH>>
  // BlockHash -> BlockHeader
  transactions: IDatabaseStore<TransactionsSchema<ST>>
  // Sequence -> BlockHash[]
  sequenceToHash: IDatabaseStore<SequenceToHashSchema>
  // BlockHash -> BlockHash[] (blocks pointing at the keyed hash)
  hashToNext: IDatabaseStore<HashToNextSchema>
  // GraphID -> Graph
  graphs: IDatabaseStore<GraphSchema>

  // When the heaviest head changes
  onChainHeadChange = new Event<[hash: BlockHash]>()
  // When ever the blockchain becomes synced
  onSynced = new Event<[]>()
  // When ever a block is added to the heaviest chain and the trees have been updated
  onConnectBlock = new Event<[block: Block<E, H, T, SE, SH, ST>, tx?: IDatabaseTransaction]>()
  // When ever a block is removed from the heaviest chain, trees have not been updated yet
  onDisconnectBlock = new Event<
    [block: Block<E, H, T, SE, SH, ST>, tx?: IDatabaseTransaction]
  >()

  constructor(
    location: string,
    strategy: Strategy<E, H, T, SE, SH, ST>,
    logger: Logger = createRootLogger(),
    metrics?: MetricsMonitor,
  ) {
    this.strategy = strategy
    this.logger = logger.withTag('blockchain')
    this.metrics = metrics || new MetricsMonitor(this.logger)
    this.verifier = strategy.createVerifier(this)
    this.db = createDB({ location })

    this.genesisBlockHash = null
    this.genesisHeader = null
    this.looseNotes = {}
    this.looseNullifiers = {}

    this.notes = new MerkleTree(strategy.noteHasher(), this.db, 'anchorchain notes', 32)

    this.nullifiers = new MerkleTree(
      strategy.nullifierHasher(),
      this.db,
      'anchorchain nullifiers',
      32,
    )

    this.headers = this.db.addStore({
      version: SCHEMA_VERSION,
      name: 'Headers',
      keyEncoding: new BufferEncoding(), // block hash
      valueEncoding: new JsonEncoding<SchemaValue<HeadersSchema<SH>>>(),
    })

    this.transactions = this.db.addStore({
      version: SCHEMA_VERSION,
      name: 'Transactions',
      keyEncoding: new BufferEncoding(), // block hash
      valueEncoding: new JsonEncoding<ST[]>(),
    })

    this.sequenceToHash = this.db.addStore({
      version: SCHEMA_VERSION,
      name: 'SequenceToHash',
      keyEncoding: new StringEncoding(), // serialized bigint sequence
      valueEncoding: new BufferArrayEncoding(), // array of block hashes
    })

    this.hashToNext = this.db.addStore({
      version: SCHEMA_VERSION,
      name: 'HashToNextHash',
      keyEncoding: new BufferEncoding(), // serialized bigint sequence
      valueEncoding: new BufferArrayEncoding(), // array of block hashes
    })

    this.graphs = this.db.addStore({
      version: SCHEMA_VERSION,
      name: 'Graphs',
      keyEncoding: new StringEncoding(), // graph id
      valueEncoding: new JsonEncoding<Graph>(),
    })
  }

  async open(): Promise<void> {
    if (this.opened) return
    this.opened = true
    await this.db.open()

    this.head = await this.getHeaviestHead()
    this.updateSynced()
  }

  async close(): Promise<void> {
    if (!this.opened) return
    this.opened = false
    await this.db.close()
  }

  protected updateSynced(): void {
    if (this.synced) {
      return
    }

    if (!this.head) {
      return
    }

    if (this.head.timestamp.valueOf() < Date.now() - MAX_SYNCED_AGE_MS) {
      return
    }

    this.synced = true
    this.onSynced.emit()
  }

  async getBlockToNext(hash: BlockHash, tx?: IDatabaseTransaction): Promise<BlockHash[]> {
    return (await this.hashToNext.get(hash, tx)) || []
  }

  async setBlockToNext(
    hash: BlockHash,
    hashes: BlockHash[],
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.hashToNext.put(hash, hashes, tx)
  }

  async setGraph(graph: Graph, tx: IDatabaseTransaction): Promise<void> {
    await this.graphs.put(graph.id.toString(), graph, tx)
  }

  async getGraph(graphId: number, tx?: IDatabaseTransaction): Promise<Graph | null> {
    const graph = await this.graphs.get(graphId.toString(), tx)
    if (!graph) {
      this.logger.debug(`Could not find requested graph with id ${graphId}`)
      return null
    }
    return graph
  }

  async resolveBlockGraph(hash: BlockHash, tx?: IDatabaseTransaction): Promise<Graph | null> {
    const header = await this.headers.get(hash, tx)

    if (!header) {
      this.logger.debug(`Couldn't get header ${hash.toString('hex')} when resolving graph`)
      return null
    }

    return await this.resolveGraph(header.graphId, tx)
  }

  async resolveGraph(graphId: number, tx?: IDatabaseTransaction): Promise<Graph | null> {
    let graph = await this.getGraph(graphId, tx)
    if (!graph) {
      this.logger.debug(`Could not resolve graph with id ${graphId}`)
      return null
    }

    while (graph && graph.mergeId) {
      graph = await this.getGraph(graph.mergeId, tx)
    }

    return graph
  }

  async getBlockGraph(hash: BlockHash, tx?: IDatabaseTransaction): Promise<Graph | null> {
    const header = await this.headers.get(hash, tx)
    if (!header) {
      this.logger.debug(`Couldn't get header ${hash.toString('hex')} when getting graph`)
      return null
    }
    return this.getGraph(header.graphId, tx)
  }

  async getTail(
    hash: BlockHash,
    tx?: IDatabaseTransaction,
  ): Promise<BlockHeader<E, H, T, SE, SH, ST> | null> {
    const graph = await this.resolveBlockGraph(hash, tx)
    if (!graph) {
      return null
    }

    const tailHash = graph.tailHash
    const tailHeader = await this.headers.get(tailHash, tx)

    if (!tailHeader) {
      this.logger.debug(`No tail for hash ${hash.toString('hex')}`)
      return null
    }
    return this.strategy.blockHeaderSerde.deserialize(tailHeader)
  }

  async getHead(
    hash: BlockHash,
    tx?: IDatabaseTransaction,
  ): Promise<BlockHeader<E, H, T, SE, SH, ST> | null> {
    const graph = await this.resolveBlockGraph(hash, tx)
    if (!graph) return null

    const heaviestHash = graph.heaviestHash

    if (!heaviestHash) {
      this.logger.debug(
        `Couldn't get heaviest hash ${hash.toString('hex')} for graph ${
          graph.id
        } when getting head for graph`,
      )
      return null
    }

    const header = await this.headers.get(heaviestHash, tx)
    if (!header) {
      this.logger.debug(
        `Couldn't get header ${hash.toString('hex')} when getting head for graph`,
      )
      return null
    }

    return this.strategy.blockHeaderSerde.deserialize(header)
  }

  async getLatest(
    hash: BlockHash,
    tx?: IDatabaseTransaction,
  ): Promise<BlockHeader<E, H, T, SE, SH, ST> | null> {
    const graph = await this.resolveBlockGraph(hash, tx)
    if (!graph) return null
    const header = await this.headers.get(graph.latestHash, tx)
    if (!header) {
      this.logger.debug(
        `Couldn't get header ${hash.toString('hex')} when getting head for graph`,
      )
      return null
    }

    return this.strategy.blockHeaderSerde.deserialize(header)
  }

  async getBlockHeader(
    hash: BlockHash,
    tx?: IDatabaseTransaction,
  ): Promise<BlockHeader<E, H, T, SE, SH, ST> | null> {
    const header = await this.headers.get(hash, tx)
    return header ? this.strategy.blockHeaderSerde.deserialize(header) : null
  }

  /**
   * Saves block header, transaction and updates sequenceToHash
   * without updating the chain (e.g. trees, graph, heaviest head, and so on)
   */
  private async setBlock(
    block: Block<E, H, T, SE, SH, ST>,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    return this.db.withTransaction(
      tx,
      [this.headers, this.transactions, this.sequenceToHash],
      'readwrite',
      async (tx) => {
        const hash = block.header.hash
        Assert.isNotNull(hash, 'Header hash should be set before header is saved')

        await this.headers.put(hash, this.strategy.blockHeaderSerde.serialize(block.header), tx)

        await Promise.all([
          this.transactions.add(
            hash,
            block.transactions.map((t) => this.strategy.transactionSerde().serialize(t)),
            tx,
          ),
          this.sequenceToHash
            .get(block.header.sequence.toString(), tx)
            .then((sequences: BlockHash[] = []) => {
              sequences.push(hash)
              return this.sequenceToHash.put(block.header.sequence.toString(), sequences, tx)
            }),
        ])
      },
    )
  }

  /**
   * This function produces a graph path for a block, which is an array of graph ids
   * going left-to-right, starting at `toGraphId`. A graph is a compressed version of
   * the block chain that records merge points and forks. Consider this graph
   *
   * A1 -> A2 -> A3
   *    -> B2 -> B2
   *          -> C3
   *
   * A graph path from C3 -> A1 would be [A, B, C]. Using this we can make decisions about forks
   * and specfically allows us to iterate from left to right. See `iterateToBlock` for more information.
   */
  protected async getBlockGraphPath(
    blockOrHash: BlockHash | BlockHeader<E, H, T, SE, SH, ST>,
    toGraphId: number | null = null,
    tx?: IDatabaseTransaction,
  ): Promise<number[]> {
    // If we are a blockHash
    if (blockOrHash instanceof Buffer) {
      const header = await this.getBlockHeader(blockOrHash, tx)
      Assert.isNotNull(header)
      blockOrHash = header
    }

    if (toGraphId === GRAPH_ID_NULL) toGraphId = null
    return await this.getGraphPath(blockOrHash.graphId, toGraphId, tx)
  }

  protected async getGraphPath(
    graphIdOrGraph: number | Graph,
    toGraphId: number | null = null,
    tx?: IDatabaseTransaction,
  ): Promise<number[]> {
    let graphId: number | null = null
    let graph: Graph | null = null

    if (typeof graphIdOrGraph === 'number') {
      graphId = graphIdOrGraph
      graph = await this.getGraph(graphIdOrGraph, tx)
    } else {
      graphId = graphIdOrGraph.id
      graph = graphIdOrGraph
    }

    Assert.isNotNull(graph)
    const path = [graphId]

    while (graph.mergeId) {
      // Used to get a graph path ending at a certain blocks graph
      if (toGraphId !== null && graph.id === toGraphId) break

      graph = await this.getGraph(graph.mergeId, tx)
      Assert.isNotNull(graph)
      path.push(graph.id)
    }

    path.reverse()
    return path
  }

  /**
   * Yields all block between 2 blocks including the two blocks
   * The blocks must have a fast forward linear path between them.
   * If the same block is passed in, then the block will be yielded
   * once. It supports both left-to-right and right-to-left iteration.
   *
   * If the two blocks are on diverging forks, blocks will be yielded
   * until it realizes it cannot find the target block and then an error
   * will be thrown
   *
   * As an example, take this graph and consider iterateToBlock(A1, B2)
   * A1 -> A2 -> A3
   *    -> B2 -> B2
   *          -> C3
   *
   * First, this is left-to-right iteration. The way this is done is
   * to first get the graph path of C3, which results in Array<GraphId>
   * which is [A, B, C]. Then start at the beginning, and each time
   * there are more than 1 block, look to see which of the blocks is the
   * next step in the graph path. Let's see we would move from A1 -> C3
   * in the example above.
   *
   * 1. Get path to C3: [A, B, C]
   * 2. Start at A1
   * 3. Load A2, B2
   * 4. B2 is graph B, the next graph we need so go there
   * 5. Load B2, C3
   * 6. C3 is graph C, the next graph we need so go there
   * 7. Current block is target block, stop.
   *
   * iterateToBlock(B2, A1) would be much simpler, and we just use the
   * Block.previousBlockHash to go backwards until we find A1.
   *
   * @param from the block to start iterating from
   * @param to the block to start iterating to
   * @param tx
   * @yields BlockHeaders between from and to
   * @throws Error if the blocks are on diverging forks after yielding wrong blocks
   * @throws Error if you try to iterate right-to-left
   */
  async *iterateToBlock(
    from: BlockHeader<E, H, T, SE, SH, ST> | Block<E, H, T, SE, SH, ST>,
    to: BlockHeader<E, H, T, SE, SH, ST> | Block<E, H, T, SE, SH, ST>,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<BlockHeader<E, H, T, SE, SH, ST>, void, void> {
    if (from instanceof Block) from = from.header
    if (to instanceof Block) to = to.header

    if (from.graphId === GRAPH_ID_NULL) return
    if (to.graphId === GRAPH_ID_NULL) return

    // right-to-left iteration
    if (from.sequence >= to.sequence) {
      const path = await this.getBlockGraphPath(from.hash, to.graphId, tx)

      if (path[0] !== to.graphId) {
        throw new Error('Start path does not match from block, are they on a fork?')
      }

      let current = from
      yield current

      while (
        current.sequence >= to.sequence &&
        current.sequence >= GENESIS_BLOCK_SEQUENCE &&
        !current.hash.equals(to.hash)
      ) {
        const header = await this.getBlockHeader(current.previousBlockHash, tx)
        Assert.isNotNull(header)
        yield header
        current = header
      }

      if (!current.hash.equals(to.hash)) {
        throw new Error(`Failed to iterate between blocks on diverging forks`)
      }
    }
    // left-to-right iteration
    else {
      const path = await this.getBlockGraphPath(to.hash, from.graphId, tx)
      let pathIndex = 0

      if (path[pathIndex] !== from.graphId) {
        throw new Error('Start path does not match from block, are they on a fork?')
      }

      let current = from
      yield current

      // left-to-right iterate the number of sequences there are between from -> to
      for (let i = current.sequence; i < to.sequence; ++i) {
        const nextBlockHashes = await this.getBlockToNext(current.hash, tx)

        let nextGraphHeader: BlockHeader<E, H, T, SE, SH, ST> | null = null
        let currentGraphHeader: BlockHeader<E, H, T, SE, SH, ST> | null = null

        for (const nextBlockHash of nextBlockHashes) {
          const nextBlockHeader = await this.getBlockHeader(nextBlockHash)
          Assert.isNotNull(nextBlockHeader)

          // We found a block on the current graph
          if (nextBlockHeader.graphId === path[pathIndex]) {
            currentGraphHeader = nextBlockHeader
          }

          // We found a block on the next graph
          if (pathIndex < path.length - 1 && nextBlockHeader.graphId === path[pathIndex + 1]) {
            nextGraphHeader = nextBlockHeader
            pathIndex++
          }
        }

        if (nextGraphHeader) {
          current = nextGraphHeader
          yield nextGraphHeader
        } else if (currentGraphHeader) {
          current = currentGraphHeader
          yield currentGraphHeader
        } else {
          throw new Error('No next block was found in our current or next graph')
        }
      }

      if (!current.hash.equals(to.hash)) {
        throw new Error(`Failed to iterate between blocks on diverging forks`)
      }
    }
  }

  /**
   * Like iterateToBlock except it always iterates between the genesis block
   * and the heaviest head
   */
  async *iterateToHead(
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<BlockHeader<E, H, T, SE, SH, ST>, void, void> {
    const head = await this.getHeaviestHead()
    if (!head) return

    for await (const block of this.iterateFromGenesis(head, tx)) {
      yield block
    }
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
    fromHash: BlockHash | BlockHeader<E, H, T, SE, SH, ST> | Block<E, H, T, SE, SH, ST>,
    toHash: BlockHash | BlockHeader<E, H, T, SE, SH, ST> | Block<E, H, T, SE, SH, ST>,
    tx?: IDatabaseTransaction,
  ): Promise<{ fork: BlockHeader<E, H, T, SE, SH, ST> | null; isLinear: boolean | null }> {
    // Gets a graph tails previous block header
    const getGraphTailPrev = async (
      graph: Graph,
      tx?: IDatabaseTransaction,
    ): Promise<BlockHeader<E, H, T, SE, SH, ST>> => {
      const tailHeader = await this.getBlockHeader(graph.tailHash, tx)
      Assert.isNotNull(tailHeader)

      const prevTailHeader = await this.getBlockHeader(tailHeader.previousBlockHash, tx)
      Assert.isNotNull(prevTailHeader)

      return prevTailHeader
    }

    let [fromHeader, toHeader] = await this.getHeadersFromInput([fromHash, toHash], tx)

    // Checking the same block
    if (fromHeader.hash.equals(toHeader.hash)) {
      return { fork: fromHeader, isLinear: true }
    }

    let fromGraph = await this.getGraph(fromHeader.graphId, tx)
    let toGraph = await this.getGraph(toHeader.graphId, tx)

    Assert.isNotNull(fromGraph)
    Assert.isNotNull(toGraph)

    let fromMoved = false
    let toMoved = false

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // If both blocks are on the same chain, return the one with the lower sequence
      if (toGraph.id === fromGraph.id) {
        const fork = fromHeader.sequence < toHeader.sequence ? fromHeader : toHeader
        const isLinear = !fromMoved || !toMoved
        return { fork, isLinear }
      }

      // If one graph merges into the other, the fork point is the previous block of the tail of the
      // merging graph if there is an actual fork point, like in the example of A3 -> B3, the fork point is A2
      // because graph B merges into A, and graph B's tail is B3, so the previous block of the tail B3 is A2
      // A1 -> A2 -> A3
      //          -> B3
      //
      // Even though we found the merge point of the chains, our block could be further back along the merged
      // into chain in some cases. Consider finding A1 -> B4 the merge point of graphs A and B is A2, but the
      // fork point is actually A1
      // A1 -> A2 -> A3
      //          -> B3 -> B4
      if (toGraph.mergeId === fromGraph.id) {
        const mergeHeader = await getGraphTailPrev(toGraph, tx)
        const isLinear = mergeHeader.sequence >= fromHeader.sequence
        const fork = isLinear ? fromHeader : mergeHeader
        return { fork, isLinear }
      }

      if (fromGraph.mergeId === toGraph.id) {
        const mergeHeader = await getGraphTailPrev(fromGraph, tx)
        const isLinear = mergeHeader.sequence >= toHeader.sequence
        const fork = isLinear ? toHeader : mergeHeader
        return { fork, isLinear }
      }

      const fromTailHeader: BlockHeader<E, H, T, SE, SH, ST> | null = await this.getBlockHeader(
        fromGraph.tailHash,
        tx,
      )
      const toTailHeader: BlockHeader<E, H, T, SE, SH, ST> | null = await this.getBlockHeader(
        toGraph.tailHash,
        tx,
      )

      Assert.isNotNull(fromTailHeader)
      Assert.isNotNull(toTailHeader)

      if (fromTailHeader.sequence >= toTailHeader.sequence) {
        if (fromGraph.mergeId === null) break
        fromHeader = await getGraphTailPrev(fromGraph, tx)
        fromGraph = await this.getGraph(fromGraph.mergeId, tx)
        Assert.isNotNull(fromHeader)
        Assert.isNotNull(fromGraph)
        fromMoved = true
      }

      if (toTailHeader.sequence >= fromTailHeader.sequence) {
        if (toGraph.mergeId === null) break
        toHeader = await getGraphTailPrev(toGraph, tx)
        toGraph = await this.getGraph(toGraph.mergeId, tx)
        Assert.isNotNull(toHeader)
        Assert.isNotNull(toGraph)
        toMoved = true
      }
    }

    return { fork: null, isLinear: null }
  }

  /**
   * Like iterateToBlock except it always iterates between the genesis block
   * and `to`
   */
  async *iterateFromGenesis(
    to: BlockHeader<E, H, T, SE, SH, ST> | Block<E, H, T, SE, SH, ST>,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<BlockHeader<E, H, T, SE, SH, ST>, void, void> {
    const genesis = await this.getGenesisHeader()
    if (!genesis) return

    for await (const block of this.iterateToBlock(genesis, to, tx)) {
      yield block
    }
  }

  /**
   * This is the main and only method to use for adding new blocks.
   * This updates the trees, the graphs, the heaviest head (and latest head)
   * and updates the blockchain accordingly.
   * @returns true if the block has been added or if it already exists. Returns false
   * if it was invalid.
   */
  async addBlock(
    networkBlockToAdd: Block<E, H, T, SE, SH, ST>,
    tx?: IDatabaseTransaction,
  ): Promise<{
    isAdded: boolean
    connectedToGenesis?: boolean
    isHeadChanged: boolean
    resolvedGraph?: Graph
    reason?: VerificationResultReason
  }> {
    const addBlockResult = await this.db.withTransaction(
      tx,
      [
        this.notes.counter,
        this.notes.leaves,
        this.notes.nodes,
        this.nullifiers.counter,
        this.nullifiers.leaves,
        this.nullifiers.nodes,
        this.headers,
        this.transactions,
        this.graphs,
        this.hashToNext,
        this.sequenceToHash,
      ],
      'readwrite',
      async (tx) => {
        const hash = networkBlockToAdd.header.recomputeHash()
        const genesis = await this.getGenesisHash(tx)

        if (await this.getBlockHeader(hash, tx)) {
          const resolvedGraph = await this.resolveBlockGraph(hash, tx)
          Assert.isNotNull(resolvedGraph)
          const connectedToGenesis =
            !!genesis && BlockHashSerdeInstance.equals(resolvedGraph.tailHash, genesis)

          return {
            isAdded: true,
            isHeadChanged: false,
            resolvedGraph: resolvedGraph,
            connectedToGenesis: connectedToGenesis,
          }
        }
        const block = networkBlockToAdd
        block.header.isValid = false
        block.header.work = BigInt(0)
        block.header.graphId = GRAPH_ID_NULL
        block.header.hash = hash
        block.header.count = 0

        // the block this block is pointing to
        const previousBlockHeader = await this.getBlockHeader(
          block.header.previousBlockHash,
          tx,
        )

        const previousHashes = await this.getBlockToNext(block.header.previousBlockHash, tx)
        const previousTail = previousBlockHeader
          ? await this.getTail(block.header.previousBlockHash, tx)
          : null

        // blocks pointing at us
        const nextHashes = await this.getBlockToNext(hash, tx)

        // Check that we don't already have a genesis. We pass validation for genesis
        // so want to be careful that no malicious blocks set their previousHash to
        // GENESIS_BLOCK_PREVIOUS
        const addingGenesis =
          !genesis &&
          BlockHashSerdeInstance.equals(block.header.previousBlockHash, GENESIS_BLOCK_PREVIOUS)

        // Adding to a genesis block chain? Or adding the genesis block itself?
        const addingToGenesis =
          addingGenesis ||
          (!!previousTail &&
            !!genesis &&
            BlockHashSerdeInstance.equals(previousTail.hash, genesis))

        // Check if we can validate this block (blocks can only be fully validated if
        // they are valid *and* connected to genesis, so we check validation in case
        // this is the right most block being added to the graph connected to genesis)
        const verification = await this.verifier.isAddBlockValid(
          previousBlockHeader,
          block,
          addingGenesis,
          addingToGenesis,
          tx,
        )

        if (previousBlockHeader && verification.valid == Validity.No)
          return {
            isHeadChanged: false,
            isAdded: false,
            reason: verification.reason,
          }

        // Check if by adding this block we can validate next blocks pointing to it.
        // A block is valid if it's internally valid, valid against previous block,
        // and in a chain of valid blocks connected to genesis.
        // Invalid next blocks are filtered out here so they don't get
        // connected to the chain.
        let nextBlocks = await Promise.all(
          nextHashes.map(async (h) => await this.getBlock(h, tx)),
        )
        nextBlocks = nextBlocks.filter((b) =>
          this.verifier.isAddBlockValid(block.header, b, addingGenesis, addingToGenesis, tx),
        )

        const nextBlockHeaders = nextBlocks
          .filter(<T>(b: T | null): b is T => b !== null)
          .map((b) => b.header)

        // We are not adding to the genesis block graph (adding to an island)
        if (!addingToGenesis) {
          // get resolved graph, return tail
          const [_graph, resolved] = await this.addToGraphs(
            previousHashes,
            previousBlockHeader,
            block.header,
            nextBlockHeaders,
            tx,
          )

          await this.setBlock(block, tx)

          return {
            isHeadChanged: false,
            resolvedGraph: resolved,
            connectedToGenesis: false,
            isAdded: true,
          }
        }

        let graph: Graph | null = null
        let resolved: Graph | null = null

        // Set to true when we detect a linear fast forward from the genesis block
        let isFastForward = false

        if (previousBlockHeader) {
          // We are adding to the genesis block chain
          const [g, r] = await this.addToGraphs(
            previousHashes,
            previousBlockHeader,
            block.header,
            nextBlockHeaders,
            tx,
          )

          graph = g
          resolved = r

          Assert.isNotNull(resolved.heaviestHash)

          isFastForward = BlockHashSerdeInstance.equals(
            previousBlockHeader.hash,
            resolved.heaviestHash,
          )
        } else {
          // We are adding the genesis block
          const [g, r] = await this.addToGraphs([], null, block.header, nextBlockHeaders, tx)
          graph = g
          resolved = r

          isFastForward = true
        }

        // Update the Block.header.work (accumulated work) of all nodes to the right
        // Also look for the new heaviest node now that we have new nodes connected
        const oldHeaviest = resolved.heaviestHash
          ? await this.getBlockHeader(resolved.heaviestHash, tx)
          : null

        await this.updateGraph(
          resolved,
          previousBlockHeader,
          block.header,
          nextBlockHeaders,
          {
            heaviest: oldHeaviest,
          },
          tx,
        )

        // did the heaviest block connecting to genesis change?
        const genesisHeaviestChanged =
          genesis &&
          BlockHashSerdeInstance.equals(resolved.tailHash, genesis) &&
          oldHeaviest &&
          resolved &&
          resolved.heaviestHash &&
          !BlockHashSerdeInstance.equals(oldHeaviest.hash, resolved.heaviestHash)

        await this.setBlock(block, tx)
        await this.setGraph(resolved, tx)
        await this.setGraph(graph, tx)

        let headChanged = false
        if (genesisHeaviestChanged && resolved.heaviestHash) {
          this.logger.debug(
            `Heaviest Changed ${oldHeaviest ? oldHeaviest?.hash.toString('hex') : ''} -> ${
              resolved.heaviestHash ? resolved.heaviestHash.toString('hex') : ''
            }: ${isFastForward ? 'LINEAR' : 'FORKED'}`,
          )

          headChanged = true

          if (isFastForward) {
            await this.updateTreesBlockToHead(block, addingGenesis, tx)
          } else {
            Assert.isNotNull(oldHeaviest)
            await this.updateTreesWithFork(resolved.heaviestHash, oldHeaviest, tx)
          }
        }

        if (addingGenesis) {
          await this.addToTreesFromBlocks([block], 0, 0, tx)
          headChanged = true
        }

        return {
          isHeadChanged: headChanged,
          resolvedGraph: resolved,
          isAdded: true,
          connectedToGenesis: true,
        }
      },
    )

    if (
      addBlockResult.isHeadChanged &&
      addBlockResult.resolvedGraph &&
      addBlockResult.resolvedGraph.heaviestHash
    ) {
      const headHash = addBlockResult.resolvedGraph.heaviestHash
      this.head = await this.getBlockHeader(headHash)
      this.onChainHeadChange.emit(headHash)
    }

    this.updateSynced()
    return addBlockResult
  }

  // Sanity check to check that heaviest head exists, and trees match it
  // If we just added a block that puts trees in a bad state, abort it
  // as its incorrect
  async checkTreeMatchesHeaviest(
    // block: Block<E, H, T, SE, SH, ST>,
    tx?: IDatabaseTransaction,
  ): Promise<boolean> {
    const noteRoot = await this.notes.rootHash(tx)
    const nullifierRoot = await this.nullifiers.rootHash(tx)

    const heaviestHead = await this.getHeaviestHead(tx)
    if (!heaviestHead) {
      this.logger.error(`No heaviest head — should never happen`)
      return false
    }

    const heaviestBlock = await this.getBlock(heaviestHead.hash, tx)
    if (!heaviestBlock) {
      this.logger.error(`No heaviest block — should never happen`)
      return false
    }

    if (
      !this.strategy
        .noteHasher()
        .hashSerde()
        .equals(noteRoot, heaviestBlock.header.noteCommitment.commitment)
    ) {
      const blockNoteSize = heaviestBlock.header.noteCommitment.size
      const noteSize = await this.notes.size(tx)

      const noteRootSerialized = this.strategy.noteHasher().hashSerde().serialize(noteRoot)
      const blockRootSerialized = this.strategy
        .noteHasher()
        .hashSerde()
        .serialize(heaviestBlock.header.noteCommitment.commitment)

      this.logger.error(
        `Note Merkle Tree is in a BAD STATE: \n
         Heviest head is ${heaviestBlock.header.hash.toString('hex')} seq ${
          heaviestBlock.header.sequence
        }
           Note tree size: ${noteSize} \n
           Note root: ${
             noteRootSerialized ? (noteRootSerialized as Buffer).toString('hex') : '???'
           } \n
           Block commitment tree size: ${blockNoteSize}\n
           Block commitment: ${
             blockRootSerialized ? (blockRootSerialized as Buffer).toString('hex') : '???'
           }\n`,
      )

      this.logger.debug(`TREES IN BAD STATE`)
      return false
    }

    if (
      !this.strategy
        .nullifierHasher()
        .hashSerde()
        .equals(nullifierRoot, heaviestBlock.header.nullifierCommitment.commitment)
    ) {
      const nullifierSize = await this.nullifiers.size(tx)
      const blockNullifierSize = heaviestBlock.header.nullifierCommitment.size
      this.logger.error(
        `After adding block ${heaviestBlock.header.hash.toString('hex')} seq ${
          heaviestBlock.header.sequence
        } Nullifier Merkle Tree is in a BAD STATE: \n
         Nullifier tree size: ${nullifierSize} \n
         Block commitment tree size: ${blockNullifierSize}`,
      )
      this.logger.debug(`TREES IN BAD STATE`)
      return false
    }

    return true
  }

  private async updateTreesWithFork(
    newHeaviestHead: BlockHash,
    oldHeaviestHead: BlockHeader<E, H, T, SE, SH, ST>,
    tx: IDatabaseTransaction,
  ): Promise<void> {
    const newHeaviestHeadHeader = await this.getBlockHeader(newHeaviestHead, tx)
    Assert.isNotNull(newHeaviestHeadHeader)

    // Step 0: remove loost notes and loose nullifiers from queue as they are stale
    this.looseNotes = {}
    this.looseNullifiers = {}

    // Step 1: Find the fork between the two heads
    const { fork } = await this.findFork(oldHeaviestHead, newHeaviestHead, tx)
    Assert.isNotNull(fork, `No fork found in updateTreesWithFork`)

    // Step 2: Collect all the blocks from the old head to the fork
    const removedIter = this.iterateToBlock(oldHeaviestHead, fork, tx)
    const removedHeaders = await AsyncUtils.materialize(removedIter)
    const removedBlocks = await Promise.all(
      removedHeaders.reverse().map((h) => this.getBlock(h, tx)),
    )

    for (const block of removedBlocks) {
      Assert.isNotNull(block)
      this.onDisconnectBlock.emit(block, tx)
    }

    // Step 3. Truncate trees to the fork
    await Promise.all([
      this.notes.truncate(fork.noteCommitment.size, tx),
      this.nullifiers.truncate(fork.nullifierCommitment.size, tx),
    ])

    // Step 3. Collect all the blocks from the fork to the new head
    const addedIter = this.iterateToBlock(newHeaviestHeadHeader, fork, tx)
    const addedHeaders = await AsyncUtils.materialize(addedIter)
    const addedBlocks = await Promise.all(
      addedHeaders.reverse().map(async (h) => {
        const block = await this.getBlock(h, tx)
        Assert.isNotNull(block)
        return block
      }),
    )

    // the forking point block is already in the chain (no need to re-add it)
    addedBlocks.shift()

    // Step 4. Add the new blocks to the trees
    await this.addToTreesFromBlocks(
      addedBlocks,
      fork.noteCommitment.size,
      fork.nullifierCommitment.size,
      tx,
    )
  }

  private async updateTreesBlockToHead(
    block: Block<E, H, T, SE, SH, ST>,
    addingGenesis: boolean,
    tx: IDatabaseTransaction,
  ): Promise<void> {
    const blocks: Block<E, H, T, SE, SH, ST>[] = []

    const heaviestHead = await this.getHeaviestHead(tx)
    if (!heaviestHead) {
      this.logger.error(
        `While updateTreesBlockToHead heaviestHead was null — should never happen`,
      )
      return
    }

    const heaviestBlock = await this.getBlock(heaviestHead.hash, tx)
    if (!heaviestBlock) {
      this.logger.error(
        `While updateTreesBlockToHead heaviestHead was null — should never happen`,
      )
      return
    }

    // we'll walk from heaviest to given block as we'll need
    // to update trees with all those blocks
    let currentBlock: Block<E, H, T, SE, SH, ST> | null = heaviestBlock
    while (
      currentBlock &&
      !BlockHashSerdeInstance.equals(currentBlock.header.hash, block.header.hash)
    ) {
      blocks.unshift(currentBlock)
      currentBlock = await this.getBlock(currentBlock.header.previousBlockHash, tx)
    }

    blocks.unshift(block)

    if (addingGenesis && blocks.length > 1) {
      throw new Error(`Adding genesis out of order is not allowed`)
    }

    const previousBlockHeader = await this.getBlockHeader(block.header.previousBlockHash, tx)

    await this.addToTreesFromBlocks(
      blocks,
      previousBlockHeader ? previousBlockHeader.noteCommitment.size : 0,
      previousBlockHeader ? previousBlockHeader.nullifierCommitment.size : 0,
      tx,
    )
  }

  private async addToTreesFromBlocks(
    blocks: Block<E, H, T, SE, SH, ST>[],
    notesIndex: number,
    nullifierIndex: number,
    tx: IDatabaseTransaction,
  ): Promise<void> {
    for (const block of blocks) {
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

      this.onConnectBlock.emit(block, tx)
    }
  }

  private async addToGraphs(
    previousHashes: BlockHash[],
    previous: BlockHeader<E, H, T, SE, SH, ST> | null,
    current: BlockHeader<E, H, T, SE, SH, ST>,
    nexts: BlockHeader<E, H, T, SE, SH, ST>[],
    tx: IDatabaseTransaction,
  ): Promise<[Graph, Graph]> {
    let graph: Graph | null = null
    let resolved: Graph | null = null
    let latest: BlockHeader<E, H, T, SE, SH, ST> | null = null

    // Connecting block into previous block's graph
    if (previous && previous.count === 0) {
      current.graphId = previous.graphId
      previous.count++

      graph = await this.getGraph(previous.graphId, tx)
      resolved = await this.resolveGraph(previous.graphId, tx)
      Assert.isNotNull(resolved)

      latest = await this.getBlockHeader(resolved.latestHash, tx)
      Assert.isNotNull(latest)

      if (this.isBlockLater(current, latest)) {
        latest = current
        resolved.latestHash = current.hash
      }

      await this.setHeader(previous, tx)
      await this.setHeader(current, tx)
      await this.setGraph(resolved, tx)
    }

    // Merge all nexts's graphs into block's graph, but choose one for
    // block to take if it doesn't have one already
    if (nexts.length) {
      for (const next of nexts) {
        const nextGraph = await this.getGraph(next.graphId, tx)
        Assert.isNotNull(nextGraph)

        const nextLatest = await this.getBlockHeader(nextGraph.latestHash, tx)
        Assert.isNotNull(nextLatest)

        if ((graph === null || resolved === null) && nextGraph) {
          // If the block has no graph yet just take it from the right block
          graph = nextGraph
          resolved = nextGraph
          latest = nextLatest
          current.graphId = nextGraph.id

          // block is the newest lowest sequence in the adopted graph
          graph.tailHash = current.hash
        } else {
          // merge right graph into the left graph
          nextGraph.mergeId = current.graphId
          await this.setGraph(nextGraph, tx)

          // when merging a graph, check if we found a new latest from the right graph
          Assert.isNotNull(latest, `Latest is not truthy`)
          if (resolved && this.isBlockLater(nextLatest, latest)) {
            latest = nextLatest
            resolved.latestHash = nextLatest.hash
          }
        }

        current.count++
      }

      Assert.isNotNull(graph)
      Assert.isNotNull(resolved)

      if (graph && resolved) {
        await this.setGraph(graph, tx)
        await this.setGraph(resolved, tx)
      }

      await this.setHeader(current, tx)
    }

    if (current.graphId == GRAPH_ID_NULL) {
      // Create a new graph for this floating block not connected to anything
      const graphId = Math.round(Math.random() * 10 ** 16)
      current.graphId = graphId

      graph = {
        id: graphId,
        mergeId: null,
        tailHash: current.hash,
        heaviestHash: null,
        latestHash: current.hash,
      }

      latest = current
      resolved = graph

      await this.setGraph(graph, tx)
      await this.setHeader(current, tx)
    }

    // Now merge our current block's graph into the previous block's graph
    if (previous && previous.graphId !== graph?.id) {
      Assert.isNotNull(latest)
      Assert.isNotNull(graph)

      const prevGraph = await this.getGraph(previous.graphId, tx)
      Assert.isNotNull(prevGraph)
      const prevResolved = await this.resolveGraph(previous.graphId, tx)
      Assert.isNotNull(prevResolved)
      const prevTail = await this.getBlockHeader(prevResolved.tailHash, tx)
      Assert.isNotNull(prevTail)
      const prevLatest = await this.getBlockHeader(prevResolved.latestHash, tx)
      Assert.isNotNull(prevLatest)

      if (this.isBlockLater(latest, prevLatest)) {
        latest = current
        prevResolved.latestHash = current.hash
      }

      previous.count++
      graph.mergeId = prevGraph.id
      resolved = prevResolved

      await this.setGraph(graph, tx)
      await this.setHeader(previous, tx)
      await this.setGraph(prevGraph, tx)
    }

    previousHashes.push(current.hash)
    await this.hashToNext.put(current.previousBlockHash, previousHashes, tx)

    if (!graph || !resolved) throw new Error('Block should always have a graph')
    return [graph, resolved]
  }

  private async updateGraph(
    resolved: Graph,
    previous: BlockHeader<E, H, T, SE, SH, ST> | null,
    current: BlockHeader<E, H, T, SE, SH, ST>,
    nexts: (BlockHeader<E, H, T, SE, SH, ST> | null)[],
    memo: { heaviest: BlockHeader<E, H, T, SE, SH, ST> | null },
    tx: IDatabaseTransaction,
  ): Promise<void> {
    // Update current blocks work from the previous block
    current.work = current.target.toDifficulty()
    if (previous) current.work = BigInt(current.work) + BigInt(previous.work)

    await this.setHeader(current, tx)

    // Look for a new heaviest head for the graph
    if (memo.heaviest === null || this.isBlockHeavier(current, memo.heaviest)) {
      memo.heaviest = current
      resolved.heaviestHash = current.hash
    }

    // Now recurse down to all of the next blocks check those too
    for (const next of nexts) {
      if (!next) continue
      const nextHashes = await this.getBlockToNext(next.hash, tx)

      const nextNexts = await Promise.all(
        nextHashes.map(async (h) => await this.getBlockHeader(h), tx),
      )
      await this.updateGraph(resolved, current, next, nextNexts, memo, tx)
    }
  }

  /**
   * Get the block with the given hash, if it exists.
   */
  async getBlock(
    hashOrHeader: BlockHash | BlockHeader<E, H, T, SE, SH, ST>,
    tx?: IDatabaseTransaction,
  ): Promise<Block<E, H, T, SE, SH, ST> | null> {
    let header = hashOrHeader instanceof BlockHeader ? hashOrHeader : null
    const hash = hashOrHeader instanceof BlockHeader ? hashOrHeader.hash : hashOrHeader

    return this.db.withTransaction(
      tx,
      [this.headers, this.transactions],
      'read',
      async (tx) => {
        const [serializedHeader, transactions] = await Promise.all([
          header ? null : this.headers.get(hash, tx),
          this.transactions.get(hash, tx),
        ])

        if (serializedHeader) {
          header = this.strategy.blockHeaderSerde.deserialize(serializedHeader)
        }

        if (header && transactions) {
          return new Block(
            header,
            transactions.map((t) => this.strategy.transactionSerde().deserialize(t)),
          )
        } else if (header || transactions) {
          throw new Error(
            `DB has inconsistent state header/transaction state for ${hash.toString('hex')}`,
          )
        }

        return null
      },
    )
  }

  /**
   * Returns true if the blockchain has a block at the given hash
   */
  async hasAtHash(hash: BlockHash, tx?: IDatabaseTransaction): Promise<boolean> {
    const header = await this.headers.get(hash, tx)
    return !!header
  }

  private async setHeader(
    header: BlockHeader<E, H, T, SE, SH, ST>,
    tx: IDatabaseTransaction,
  ): Promise<void> {
    const serializedBlockHeader = this.strategy.blockHeaderSerde.serialize(header)
    const hash = header.hash
    await this.headers.put(hash, serializedBlockHeader, tx)
  }

  async getHeaviestHead(
    tx?: IDatabaseTransaction,
  ): Promise<BlockHeader<E, H, T, SE, SH, ST> | null> {
    const genesisHash = await this.getGenesisHash(tx)
    if (!genesisHash) return null
    return await this.getHead(genesisHash, tx)
  }

  async getLatestHead(
    tx?: IDatabaseTransaction,
  ): Promise<BlockHeader<E, H, T, SE, SH, ST> | null> {
    const genesisHash = await this.getGenesisHash(tx)
    if (!genesisHash) return null
    return await this.getLatest(genesisHash, tx)
  }

  /**
   * Returns true if the blockchain has any blocks at the given sequence
   */
  async hasAtSequence(sequence: BigInt, tx?: IDatabaseTransaction): Promise<boolean> {
    const hashes = await this.getAtSequence(sequence, tx)
    return !!hashes && hashes.length > 0
  }

  /**
   * Returns an array of hashes for blocks at the given sequence
   */
  async getAtSequence(sequence: BigInt, tx?: IDatabaseTransaction): Promise<BlockHash[]> {
    return (await this.sequenceToHash.get(sequence.toString(), tx)) || []
  }

  /**
   * Create a new block to be mined. Excluding the randomness, the new block is
   * guaranteed to be valid with the current state of the chain.
   * If the chain's head does not change, then the new block can be added
   * to the chain, once its randomness is set to something that meets the
   * target of the chain.
   *
   * If a valid block cannot be constructed, an error is thrown. This should
   * only happen if any of the transactions or the miner's fee
   * is invalid.
   *
   * Mining is the process of adjusting the randomness and calculating the hash
   * until you find a hash that is lower than the block's target. That does not
   * happen in this function.
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
    return await this.db.transaction(
      this.notes.db
        .getStores()
        .concat(this.nullifiers.db.getStores())
        .concat([
          this.headers,
          this.transactions,
          this.graphs,
          this.hashToNext,
          this.sequenceToHash,
        ]),
      'readwrite',
      async (tx) => {
        const originalNoteSize = await this.notes.size(tx)
        const originalNullifierSize = await this.nullifiers.size(tx)

        let previousBlockHash
        let previousSequence
        let target
        const timestamp = new Date()

        const heaviestHead = await this.getHeaviestHead(tx)
        if (!heaviestHead) {
          previousBlockHash = GENESIS_BLOCK_PREVIOUS
          previousSequence = BigInt(0)
          target = Target.initialTarget()
        } else {
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
          const previousHeader = await this.getBlockHeader(heaviestHead.previousBlockHash, tx)
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
            this.logger.warn(
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

  async getGenesisHash(tx?: IDatabaseTransaction): Promise<BlockHash | null> {
    if (this.genesisBlockHash) return this.genesisBlockHash
    // first check if we have anything at GENESIS_BLOCK_SEQUENCE
    const genesis = await this.getAtSequence(GENESIS_BLOCK_SEQUENCE, tx)
    if (!genesis) return null

    this.genesisBlockHash = genesis[0]

    return this.genesisBlockHash
  }

  async getGenesisHeader(
    tx?: IDatabaseTransaction,
  ): Promise<BlockHeader<E, H, T, SE, SH, ST> | null> {
    if (!this.genesisHeader) {
      const genesisHash = await this.getGenesisHash()
      if (!genesisHash) return null
      this.genesisHeader = await this.getBlockHeader(genesisHash, tx)
    }
    return this.genesisHeader
  }

  hasGenesisBlock(tx?: IDatabaseTransaction): Promise<boolean> {
    return this.hasAtSequence(GENESIS_BLOCK_SEQUENCE, tx)
  }

  private isBlockLater(
    a: BlockHeader<E, H, T, SE, SH, ST>,
    b: BlockHeader<E, H, T, SE, SH, ST>,
  ): boolean {
    if (a.sequence !== b.sequence) return a.sequence > b.sequence
    // tie breaker
    return a.hash < b.hash
  }

  isBlockHeavier(
    a: BlockHeader<E, H, T, SE, SH, ST>,
    b: BlockHeader<E, H, T, SE, SH, ST>,
  ): boolean {
    if (a.work !== b.work) return a.work > b.work
    if (a.sequence !== b.sequence) return a.sequence > b.sequence
    if (a.target.toDifficulty() !== b.target.toDifficulty())
      return a.target.toDifficulty() > b.target.toDifficulty()
    return a.hash < b.hash
  }

  async isEmpty(tx?: IDatabaseTransaction): Promise<boolean> {
    return (await this.notes.size(tx)) === 0 && (await this.nullifiers.size(tx)) === 0
  }

  /**
   * Iterates through all transactions, starting from the heaviest head and walking backward.
   */
  async *getTransactions(
    fromBlockHash: Buffer | null = null,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<
    { transaction: T; initialNoteIndex: number; sequence: BigInt; blockHash: string },
    void,
    unknown
  > {
    let to: BlockHeader<E, H, T, SE, SH, ST> | null
    if (fromBlockHash) {
      to = await this.getBlockHeader(fromBlockHash, tx)
    } else {
      to = await this.getHeaviestHead(tx)
    }

    if (!to) return

    for await (const header of this.iterateFromGenesis(to, tx)) {
      for await (const transaction of this.getTransactionsForBlock(header, tx)) {
        yield transaction
      }
    }
  }

  async *getTransactionsForBlock(
    blockHeader: BlockHeader<E, H, T, SE, SH, ST>,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<
    { transaction: T; initialNoteIndex: number; sequence: BigInt; blockHash: string },
    void,
    unknown
  > {
    const blockHash = blockHeader.hash
    let initialNoteIndex = blockHeader.noteCommitment.size

    if (!blockHeader) {
      throw new Error(`No block found with hash ${blockHash.toString('hex')}`)
    }

    // Transactions should be handled in reverse order as they're added in anchorChain.newBlock,
    // so treeSize gets decremented appropriately

    const serializedTransactions = await this.db.withTransaction(
      tx,
      [this.transactions],
      'read',
      async (dbTransaction) => {
        if (blockHash === null) return
        return await this.transactions.get(blockHash, dbTransaction)
      },
    )

    if (serializedTransactions) {
      for (const serializedTransaction of serializedTransactions.reverse()) {
        const transaction = this.strategy.transactionSerde().deserialize(serializedTransaction)
        initialNoteIndex -= transaction.notesLength()

        yield {
          transaction,
          initialNoteIndex,
          blockHash: blockHash.toString('hex'),
          sequence: blockHeader.sequence,
        }
      }
    }
  }

  /**
   * This function will take multiple BlockHash | BlockHeader | Block and normalize it to BlockHeader
   * performing database loads if it needs to. It's useful for operating on blocks with variadic
   * inputs for convenience.
   *
   * @param inputs BlockHash | BlockHeader | Block to turn into BlockHeader
   * @param tx
   * @returns BlockHeader[] assocaited with the inputs
   */
  protected async getHeadersFromInput(
    inputs: Array<BlockHash | BlockHeader<E, H, T, SE, SH, ST> | Block<E, H, T, SE, SH, ST>>,
    tx?: IDatabaseTransaction,
  ): Promise<Array<BlockHeader<E, H, T, SE, SH, ST>>> {
    type LoadResult = [BlockHeader<E, H, T, SE, SH, ST>, BlockHash, number]

    const outputs: BlockHeader<E, H, T, SE, SH, ST>[] = []
    const promises: Promise<LoadResult>[] = []

    for (let i = 0; i < inputs.length; ++i) {
      const input = inputs[i]

      if (input instanceof Block) {
        // Transform any blocks to headers
        outputs[i] = input.header
      } else if (input instanceof Buffer) {
        // Load any hashes into headers
        const promise = this.getBlockHeader(input, tx).then((r) => [r, input, i] as LoadResult)
        promises.push(promise)
      } else {
        // headers should just get copied over
        outputs[i] = input
      }
    }

    // Wait for all block headers to load
    if (promises.length > 0) {
      const loaded = await Promise.all(promises)
      for (const [header, hash, index] of loaded) {
        Assert.isNotNull(header, `Error loading block by header: ${hash.toString('hex')}`)
        outputs[index] = header
      }
    }

    return outputs
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
