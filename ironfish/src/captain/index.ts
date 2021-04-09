/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { default as Block, BlockSerde } from './anchorChain/blockchain/Block'
import Strategy from './anchorChain/strategies'
import Transaction from './anchorChain/strategies/Transaction'
import { BlocksResponse } from '../network/messages'
import { Event } from '../event'
import { MetricsMonitor } from '../metrics'
import { createRootLogger, Logger } from '../logger'
import { JsonSerializable } from '../serde'

import { BlockSyncer, BlockSyncerChainStatus } from './blockSyncer'
import { IDatabase } from '../storage'
import Blockchain from './anchorChain/blockchain'
import { Identity } from '../network'

export { Assert } from '../assert'
export {
  Block,
  BlockHash,
  BlockHeader,
  BlockHeaderSerde,
  BlockSerde,
  Target,
  Validity,
  VerificationResult,
  GENESIS_BLOCK_PREVIOUS,
  GENESIS_BLOCK_SEQUENCE,
  SerializedBlock,
  SerializedBlockHeader,
} from './anchorChain/blockchain'
export { Nullifier, NullifierHash, NullifierHasher } from './anchorChain/nullifiers'
export { default as Strategy, Transaction, Spend } from './anchorChain/strategies'
export {
  default as MerkleTree,
  MerkleHasher,
  RangeHasher,
  Side as WitnessSide,
} from './anchorChain/merkleTree'
export {
  default as Witness,
  WitnessNode,
  SerializedWitnessNode,
} from './anchorChain/merkleTree/Witness'

// Exports used in testUtilities
export { BlockSyncer, BlockSyncerChainStatus, BlocksResponse }

/**
 * Captain ensures that the chain is kept in sync with the latest version
 * of the network.
 *
 * It does the following tasks:
 *  *  Request the head of the heaviest chain from a randomly chosen peer to make
 *     sure it's up to date
 *  *  Request notes and nullifiers if the chain is not currently connected
 *     to the trees
 *  *  Optimistically sync blocks if the chain is connected to the trees, but
 *     either its head is not its latest or its tail is not the genesis block
 *  *  Verify incoming blocks and transactions before allowing them to be
 *     gossip'd
 *  *  Respond to requests for notes, nullifiers, or blocks
 *
 *
 * Captain is also responsible for routing miner and client events out to the network.
 * These include:
 *  *  Newly mined blocks
 *  *  New transactions to be spent
 *
 * Finally Captain is responsible for routing network events out to the miner:
 *  *  New transactions that need to be mined
 *
 * @typeParam E Note element stored in the notes Merkle Tree and emitted in transactions
 * @typeParam H the hash of an `E`. Used for the internal nodes and root hash
 *              of the notes Merkle Tree
 * @typeParam T Type of a transaction stored on Captain's chain.
 * @typeParam ST The serialized format of a `T`. Conversion between the two happens
 *               via the `strategy`.
 */
export default class Captain<
  E,
  H,
  T extends Transaction<E, H>,
  SE extends JsonSerializable,
  SH extends JsonSerializable,
  ST
> {
  /**
   * Blockchain strategy that tells us how to hash and serialize stuff.
   */
  strategy: Strategy<E, H, T, SE, SH, ST>
  /**
   * The blockchain and two global merkle trees for notes and nullifiers
   */
  chain: Blockchain<E, H, T, SE, SH, ST>
  /**
   * Responsible for syncing blocks that we don't have yet.
   */
  blockSyncer: BlockSyncer<E, H, T, SE, SH, ST>
  /**
   * Serializer for blocks
   */
  blockSerde: BlockSerde<E, H, T, SE, SH, ST>
  /**
   * Logger instance used in place of console logs
   */
  logger: Logger
  /**
   * Metrics monitor to record performance based metrics
   */
  metrics: MetricsMonitor

  /**
   * Emitted when a new block has been created, such as
   * when a new block has been mined.
   */
  onNewBlock = new Event<[Block<E, H, T, SE, SH, ST>]>()
  /** Emitted when a block is being requested by header hash or sequence */
  onRequestBlocks = new Event<[hash: Buffer, nextBlockDirection: boolean, peer?: Identity]>()
  /** Emitted when a note is being requested by index */
  onRequestNote = new Event<[position: number]>()
  /** Emitted when a nullifier is being requested by index */
  onRequestNullifier = new Event<[position: number]>()

  /**
   * Private constructor for a `Captain`.
   *
   * @remarks Public code should use {@link Captain.new} instead.
   *
   * @param chain The storage-connected AnchorChain that manages the merkle trees
   * and the blockchain.
   */
  private constructor(
    chain: Blockchain<E, H, T, SE, SH, ST>,
    logger: Logger,
    metrics: MetricsMonitor,
  ) {
    this.metrics = metrics
    this.strategy = chain.strategy
    this.chain = chain
    this.blockSyncer = new BlockSyncer(this, logger)
    this.blockSerde = new BlockSerde(chain.strategy)
    this.logger = logger
  }

  /**
   * Construct a new `Captain`
   *
   * @remarks the type parameters are normally inferred from the `strategy`.
   *
   * @param chain The storage-backed AnchorChain that manages the merkle trees
   * and the block chain.
   * @typeParam E Note element stored in transactions and the notes Merkle Tree
   * @typeParam H the hash of an `E`. Used for the internal nodes and root hash
   *              of the notes Merkle Tree
   * @typeParam T Type of a transaction stored on Captain's chain.
   * @typeParam ST The serialized format of a `T`. Conversion between the two happens
   *               via the `strategy`.
   */
  static async new<
    E,
    H,
    T extends Transaction<E, H>,
    SE extends JsonSerializable,
    SH extends JsonSerializable,
    ST
  >(
    db: IDatabase,
    strategy: Strategy<E, H, T, SE, SH, ST>,
    chain?: Blockchain<E, H, T, SE, SH, ST>,
    logger: Logger = createRootLogger(),
    metrics?: MetricsMonitor,
  ): Promise<Captain<E, H, T, SE, SH, ST>> {
    logger = logger.withTag('captain')
    metrics = metrics || new MetricsMonitor(logger)
    chain = chain || (await Blockchain.new(db, strategy, logger, metrics))
    return new Captain(chain, logger, metrics)
  }

  /**
   * Start the various syncing, requesting, and handling tasks.
   *
   * @remarks don't forget to call shutdown on completion
   */
  async start(): Promise<void> {
    if ((await this.chain.hasGenesisBlock()) === false) {
      throw new Error('Captain cannot start without a genesis block on the chain')
    }
  }

  onPeerNetworkReady(): void {
    void this.blockSyncer.start()
  }

  onPeerNetworkNotReady(): void {
    void this.blockSyncer.shutdown()
  }

  /**
   * Instruct the various captain tasks to shut down their loops.
   *
   * Waits for all in-flight promises to complete before returning.
   */
  async shutdown(): Promise<void> {
    await Promise.all([this.blockSyncer.shutdown()])
  }

  /** Used to request a nullifier by position */
  requestNullifier(position: number): void {
    this.onRequestNullifier.emit(position)
  }

  /** Used to request a note by position */
  requestNote(position: number): void {
    this.onRequestNote.emit(position)
  }

  /** Used to request a block by header hash or sequence */
  requestBlocks(hash: Buffer, nextBlockDirection: boolean, peer?: Identity): void {
    this.onRequestBlocks.emit(hash, nextBlockDirection, peer)
  }

  /**
   * Submit a freshly mined block to be forwarded to the p2p network
   *
   * This method would only be used by miners.
   * @param block the block that has been mined by an external miner or pool.
   */
  emitBlock(block: Block<E, H, T, SE, SH, ST>): void {
    this.onNewBlock.emit(block)
  }
}
