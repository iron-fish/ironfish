/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Blockchain, { AddBlockResult } from './anchorChain/blockchain'
import Block, { BlockSerde, SerializedBlock } from './anchorChain/blockchain/Block'
import { BlockHash } from './anchorChain/blockchain/BlockHeader'
import Transaction from './anchorChain/strategies/Transaction'
import { BlockRequest } from '../network/messages'
import {
  CannotSatisfyRequestError,
  IncomingPeerMessage,
  MessagePayload,
  RPC_TIMEOUT_MILLIS,
} from '../network'
import Serde, { BufferSerde, JsonSerializable } from '../serde'
import { MetricsMonitor, Meter } from '../metrics'
import Captain from '.'
import { BlocksResponse } from '.'
import { Logger } from '../logger'
import LeastRecentlyUsed from 'lru-cache'
import { ErrorUtils } from '../utils'
import { Assert } from './../assert'

export const MAX_MESSAGE_SIZE = 500000 // 0.5 MB
export const MAX_BLOCKS_PER_MESSAGE = 1

export const ALLOWED_TRANSITIONS_TO_FROM = {
  ['STARTING']: ['STOPPED'],
  ['SYNCING']: ['IDLE', 'REQUESTING', 'SYNCING'],
  ['IDLE']: ['SYNCING', 'REQUESTING', 'STARTING'],
  ['STOPPING']: ['IDLE', 'SYNCING', 'REQUESTING'],
  ['STOPPED']: ['STOPPING'],
  ['REQUESTING']: ['SYNCING', 'IDLE'],
}

/**
 * Responsible for the metrics used in the status command.
 */
export type BlockSyncerChainStatus = {
  blockAddingSpeed: Meter
  speed: Meter
}

export type Request = {
  hash: BlockHash
  fromPeer?: string
  nextBlockDirection?: boolean
}

export enum NetworkBlockType {
  GOSSIP = 'GOSSIP',
  SYNCING = 'SYNCING',
}

export type BlockToProcess<
  E,
  H,
  T extends Transaction<E, H>,
  SE extends JsonSerializable,
  SH extends JsonSerializable,
  ST
> = {
  block: Block<E, H, T, SE, SH, ST>
  fromPeer: string
  type: NetworkBlockType
}

type ExcludeTypeKey<K> = K extends 'type' ? never : K
type ExcludeTypeField<A> = { [K in ExcludeTypeKey<keyof A>]: A[K] }
type ExtractActionParameters<A, Type> = A extends { type: Type } ? ExcludeTypeField<A> : never

type ActionIdle = { type: 'IDLE' }
type ActionStopped = { type: 'STOPPED' }
type ActionStarting = { type: 'STARTING' }
type ActionStopping = { type: 'STOPPING' }
type ActionRequest = {
  type: 'REQUESTING'
  request: Request
}
type ActionSyncing<
  E,
  H,
  T extends Transaction<E, H>,
  SE extends JsonSerializable,
  SH extends JsonSerializable,
  ST
> = {
  type: 'SYNCING'
  block: BlockToProcess<E, H, T, SE, SH, ST>
}
type ActionState<
  E,
  H,
  T extends Transaction<E, H>,
  SE extends JsonSerializable,
  SH extends JsonSerializable,
  ST
> =
  | ActionRequest
  | ActionStopped
  | ActionStarting
  | ActionStopping
  | ActionIdle
  | ActionSyncing<E, H, T, SE, SH, ST>

type ActionType<
  E,
  H,
  T extends Transaction<E, H>,
  SE extends JsonSerializable,
  SH extends JsonSerializable,
  ST
> = ActionState<E, H, T, SE, SH, ST>['type']

/**
 * Responsible for syncing blocks with the chain.
 *
 * Blocks can be synced from three different sources
 * - from a gossip message in the networking layer
 * - from the mining director when a miner successfully added a block
 * - from a network response following a request
 *
 * Blocks are added in the queue blocksForProcessing and missing blocks
 * between the heaviest chain and the latest block are requested
 *
 * @remarks
 * Note the *heaviest* chain is the chain of blocks that we currently believe
 * has accrued the most work, based on the blocks we have actually received.
 *
 * The *latest* chain is the one that starts from the block that the network claims
 * was mined most recently.
 *
 * @typeParam E WasmNoteEncrypted
 *              Note element stored in transactions and the notes Merkle Tree
 * @typeParam H WasmNoteEncryptedHash
 *              the hash of an `E`. Used for the internal nodes and root hash
 *              of the notes Merkle Tree
 * @typeParam T Transaction
 *              Type of a transaction stored on Captain's chain.
 * @typeParam SE SerializedWasmNoteEncrypted
 * @typeParam SH SerializedWasmNoteEncryptedHash
 * @typeParam ST SerializedTransaction
 *               The serialized format of a `T`. Conversion between the two happens
 *               via the `strategy`.
 */
export class BlockSyncer<
  E,
  H,
  T extends Transaction<E, H>,
  SE extends JsonSerializable,
  SH extends JsonSerializable,
  ST
> {
  hashSerde: Serde<BlockHash, string>
  blockSerde: Serde<Block<E, H, T, SE, SH, ST>, SerializedBlock<SH, ST>>
  chain: Blockchain<E, H, T, SE, SH, ST>
  private metrics: MetricsMonitor

  private _state: Readonly<ActionState<E, H, T, SE, SH, ST>> = {
    type: 'STOPPED',
  }

  public status: BlockSyncerChainStatus

  private blockSyncPromise: Promise<void>
  public blockRequestPromise: Promise<void>

  /**
   * Reference blocks that we most recently got a request for.
   */
  recentBlocks: LeastRecentlyUsed<string, Block<E, H, T, SE, SH, ST>>

  /**
   * Think of this like callbacks for the network bridge to use when we get
   * a response to our block request, mapping the request we've made to the response
   */
  private blockRequests = new Map<
    string,
    {
      resolve: (message: IncomingPeerMessage<BlocksResponse<SH, ST>>) => void
      reject: (error?: unknown) => void
    }
  >()

  blocksForProcessing: BlockToProcess<E, H, T, SE, SH, ST>[]

  logger: Logger

  /**
   * construct a new BlockSyncer
   *
   * @param captain Reference to the Captain object, which holds
   * the AnchorChain that lets us interact with the local chain.
   */
  constructor(readonly captain: Captain<E, H, T, SE, SH, ST>, logger: Logger) {
    this.hashSerde = new BufferSerde(32)
    this.blockSerde = new BlockSerde(captain.strategy)
    this.metrics = captain.metrics
    this.chain = this.captain.chain
    this.blockSyncPromise = Promise.resolve()
    this.blockRequestPromise = Promise.resolve()
    this.logger = logger
    this.recentBlocks = new LeastRecentlyUsed(500)
    this.blocksForProcessing = []

    this.status = {
      blockAddingSpeed: this.metrics.addMeter(),
      speed: this.metrics.addMeter(),
    }
  }

  get state(): Readonly<ActionState<E, H, T, SE, SH, ST>> {
    return this._state
  }

  /**
   * Start the tasks for requesting the latest blocks and for optimistic sync.
   */
  async start(): Promise<void> {
    this.dispatch('STARTING')
    this.dispatch('IDLE')

    const heaviestHead = await this.chain.getHeaviestHead()
    Assert.isNotNull(heaviestHead)
    this.dispatch('REQUESTING', {
      request: { hash: heaviestHead.hash, nextBlockDirection: true },
    })
  }

  dispatch<Type extends ActionType<E, H, T, SE, SH, ST>>(
    type: Type,
    args?: ExtractActionParameters<ActionState<E, H, T, SE, SH, ST>, Type>,
  ): void {
    const { type: fromType } = this.state

    if (!ALLOWED_TRANSITIONS_TO_FROM[type].includes(fromType)) {
      return
    }

    let action
    switch (type) {
      case 'IDLE':
        action = { type, ...args } as ActionIdle
        this._state = action
        this.getNextBlockToSync()
        break
      case 'REQUESTING':
        action = { type, ...args } as ActionRequest
        this._state = action
        this.requestOneBlock(action.request)
        break
      case 'SYNCING':
        action = { type, ...args } as ActionSyncing<E, H, T, SE, SH, ST>
        this._state = action
        this.blockRequester(action.block)
        break
      default:
        action
        this._state = { type } as { type: 'STOPPING' | 'STOPPED' | 'STARTING' }
    }
  }

  addBlockToProcess(
    block: Block<E, H, T, SE, SH, ST>,
    fromPeer: string,
    type: NetworkBlockType,
  ): void {
    if (
      this.blocksForProcessing &&
      this.blocksForProcessing[0] &&
      block.header.sequence <= this.blocksForProcessing[0].block.header.sequence
    ) {
      this.blocksForProcessing.unshift({ block, fromPeer, type })
    } else {
      this.blocksForProcessing.push({ block, fromPeer, type })
    }

    this.getNextBlockToSync()
  }

  getNextBlockToSync(): void {
    if (this.state.type !== 'IDLE') return

    const nextBlockToProcess = this.blocksForProcessing.shift()

    if (nextBlockToProcess) this.dispatch('SYNCING', { block: nextBlockToProcess })
  }

  /**
   * Instruct all requesting tasks to shut down.
   *
   * Does not resolve until all outstanding promises have terminated.
   */
  async shutdown(): Promise<void> {
    if (this.state.type === 'STOPPED' || this.state.type === 'STOPPING') return

    this.dispatch('STOPPING')
    await this.blockRequestPromise
    await this.blockSyncPromise
    this.dispatch('STOPPED')
  }

  async handleBlockRequestHelper(
    message: IncomingPeerMessage<BlockRequest>,
  ): Promise<SerializedBlock<SH, ST>[]> {
    const date = Date.now()
    const blocks: SerializedBlock<SH, ST>[] = []
    const hash =
      message.message.payload.hash !== null
        ? this.hashSerde.deserialize(message.message.payload.hash)
        : null
    if (!hash) {
      throw new CannotSatisfyRequestError(`Couldn't deserialize request`)
    }

    if (message.message.payload.nextBlockDirection) {
      const nextBlocks = await this.chain.hashToNext.get(hash)
      if (!nextBlocks) return []

      for (const nextHash of nextBlocks) {
        const block = await this.getBlock(null, nextHash)
        if (block) {
          const serialized = this.blockSerde.serialize(block)
          blocks.push(serialized)
        }
      }
    } else {
      // request is for a specific block
      const block = await this.getBlock(null, hash)
      if (!block) {
        throw new CannotSatisfyRequestError(
          `Don't have requested block ${hash.toString('hex')}`,
        )
      }

      const serialized = this.blockSerde.serialize(block)
      blocks.push(serialized)
    }

    const direction = message.message.payload.nextBlockDirection ? 'FORWARDS' : 'BACKWARDS'
    this.logger.debug(
      `Responding to ${hash.toString('hex')} in ${direction} direction with ${
        blocks.length
      } blocks — ${Date.now() - date} ms`,
    )

    return blocks
  }

  /**
   * Handle an incoming request for a specific block
   * or request for next block given a hash
   *
   * @returns a promise that resolves to the requested block, or throws a
   * CannotSatisfyRequest error if we don't have it.
   */
  async handleBlockRequest(
    message: IncomingPeerMessage<BlockRequest>,
  ): Promise<MessagePayload<BlocksResponse<SH, ST>>> {
    const blocks: SerializedBlock<SH, ST>[] = await this.handleBlockRequestHelper(message)

    if (blocks.length == 0) {
      const heaviestHead = await this.chain.getHeaviestHead()
      Assert.isNotNull(heaviestHead)

      const hash =
        message.message.payload.hash !== null
          ? this.hashSerde.deserialize(message.message.payload.hash)
          : null
      // if the request is for a block ahead of heaviest, return []
      if (hash && this.hashSerde.equals(hash, heaviestHead.hash)) {
        return { blocks: [] }
      }

      // then the request was for blocks in the forwards direction that we didn't have
      // in this case we'll send them our heaviest head instead
      const block = await this.getBlock(null, heaviestHead.hash)
      Assert.isNotNull(block)

      const serialized = this.blockSerde.serialize(block)
      blocks.push(serialized)
    }

    const response = { blocks: blocks }

    return response
  }

  /** Called when a BlockResponse has been returned in response to a BlockRequest.
   * It resolves any pending requests for this block by sequence or hash.
   */
  handleBlockResponse(
    message: IncomingPeerMessage<BlocksResponse<SH, ST>>,
    originalRequest: BlockRequest,
  ): void {
    const request = this.blockRequests.get(this.getCacheKey(null, originalRequest.payload.hash))

    request?.resolve(message)
  }

  /** Handler for when an error occurs when trying to
   * process a pending block request. */
  handleBlockRequestError(originalRequest: BlockRequest, error?: unknown): void {
    const request = this.blockRequests.get(this.getCacheKey(null, originalRequest.payload.hash))

    request?.reject(error)
  }

  /**
   * Fill in any gaps between the latest block tail and heaviest head,
   * and between the heaviest tail and the genesis block.
   *
   * 1. Get latest block
   * 2. If their latest is ahead of our heaviest block, request blocks from latest to heaviest
   * 3. Repeat from the tail of the heaviest chain
   * 4. stop conditions:
   *    - latest is not ahead of heaviest
   */
  blockRequester(blockToProcess: BlockToProcess<E, H, T, SE, SH, ST>): void {
    // if the latest block we've processed is ahead of the head, ask for head + 1 sequence blocks
    this.blockSyncPromise = (async () => {
      const time = Date.now()
      const latestBlock = blockToProcess.block
      const addBlockResult: AddBlockResult = await this.chain.addBlock(latestBlock)
      const timeToAddBlock = Date.now() - time
      this.logger.debug(`Adding block took ${timeToAddBlock} ms`)

      // Metrics status update
      this.status.speed.add(1)
      this.status.blockAddingSpeed.add(timeToAddBlock)

      if (!addBlockResult.isAdded || !addBlockResult.resolvedGraph) {
        this.logger.debug(
          `Block ${latestBlock.header.hash.toString('hex')} ${
            latestBlock.header.sequence
          } is either already added, or invalid`,
        )
        this.dispatch('IDLE')
        return
      }

      // if we added a gossip block that is connected to genesis,
      // we dont need to request later blocks
      if (
        blockToProcess.type === NetworkBlockType.GOSSIP &&
        addBlockResult.connectedToGenesis
      ) {
        this.dispatch('IDLE')
        return
      }
      let request: Request

      // is the block we added connected to genesis or is it an island graph?
      if (addBlockResult.connectedToGenesis) {
        Assert.isNotNull(addBlockResult.resolvedGraph.heaviestHash)
        // then we request the next block in the forward direction
        request = {
          hash: addBlockResult.resolvedGraph.heaviestHash,
          nextBlockDirection: true,
        }
        this.logger.debug(
          `Requesting NEXT block from ${addBlockResult.resolvedGraph.heaviestHash.toString(
            'hex',
          )}`,
        )
      } else {
        // we just added an island, so we want to request the previous block of the tail
        // for the resolved graph (until it's no longer an island and connects to genesis)
        // make sure you are asking the same peer who gave you this block
        const tailHeader = await this.chain.getBlockHeader(
          addBlockResult.resolvedGraph.tailHash,
        )
        Assert.isNotNull(tailHeader)
        this.logger.debug(
          `Requesting BACKWARDS block ${tailHeader.previousBlockHash.toString(
            'hex',
          )} from resolved tail of an island block`,
        )

        // this should never happen
        if (tailHeader.sequence === BigInt(1)) {
          throw new Error(`Chain in bad state - can't request block before genesis`)
        }

        request = {
          hash: tailHeader.previousBlockHash,
          fromPeer: blockToProcess.fromPeer,
          nextBlockDirection: false,
        }
      }

      this.dispatch('REQUESTING', { request })
    })()
  }

  /** Starts a pending request for a block by hash
   *
   * The returning promise resolves when the block is received
   * through handleBlockResponse rejected if the request times
   * out, or errors.
   */
  async requestBlocks(
    originalRequest: Request,
  ): Promise<IncomingPeerMessage<BlocksResponse<SH, ST>> | null> {
    const key = this.getCacheKey(null, originalRequest.hash)

    return new Promise<IncomingPeerMessage<BlocksResponse<SH, ST>>>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(`Request block timeout exceeded ${RPC_TIMEOUT_MILLIS}`),
        RPC_TIMEOUT_MILLIS,
      )

      const request = {
        resolve: (...args: Parameters<typeof resolve>): void => {
          this.blockRequests.delete(key)
          clearTimeout(timeout)
          resolve(...args)
        },
        reject: (...args: Parameters<typeof reject>): void => {
          this.blockRequests.delete(key)
          clearTimeout(timeout)
          reject(...args)
        },
      }

      this.blockRequests.set(key, request)
      this.captain.requestBlocks(
        originalRequest.hash,
        !!originalRequest.nextBlockDirection,
        originalRequest.fromPeer,
      )
    })
  }

  /**
   * Request a single block.
   *
   * @remarks This may be used to request a specific block, or the latest block.
   *
   * @param requestId An identifier for the request.
   * @param hash A hash to index a request from. If not defined, the request is
   * for the latest hash.
   * @param sequence The returned block will be for the block that has the
   * given sequence and is before `hash`.
   */
  requestOneBlock(request: Request): void {
    this.blockRequestPromise = (async () => {
      const hash = request.hash

      // Already requesting this block
      if (this.blockRequests.has(this.getCacheKey(null, hash))) {
        this.dispatch('IDLE')
        return
      }

      let response
      const time = Date.now()
      try {
        response = await this.requestBlocks(request)
      } catch (error: unknown) {
        this.logger.debug(
          `Request for ${request.hash.toString('hex')} ${
            request.nextBlockDirection ? 'FORWARDS' : 'BACKWARDS'
          } failed: ${ErrorUtils.renderError(error)}`,
        )

        // If a request fails because of a disconnect, we may be stopping because were no longer connected to the network
        if (this.state.type === 'STOPPING' || this.state.type === 'STOPPED') {
          return
        }

        this.dispatch('IDLE')
        return
      }

      if (!response) {
        this.logger.debug(
          `Request for ${request.hash.toString('hex')} ${
            request.nextBlockDirection ? 'FORWARDS' : 'BACKWARDS'
          } came back with nothing`,
        )

        this.dispatch('IDLE')
        return
      }

      this.logger.debug(
        `Request for ${request.hash.toString('hex')} ${
          request.nextBlockDirection ? 'FORWARDS' : 'BACKWARDS'
        } resolved in ${Date.now() - time}ms`,
      )

      let block
      try {
        const blocks = response.message.payload.blocks
        for (const serializedBlock of blocks) {
          block = this.blockSerde.deserialize(serializedBlock)

          // TODO Network serialization for Block would be great here
          block.header.isValid = false
          block.header.work = BigInt(0)
          block.header.graphId = -1

          this.addBlockToProcess(block, response.peerIdentity, NetworkBlockType.SYNCING)
        }
      } catch {
        this.logger.debug(`Couldn't deserialize incoming block`)
        this.dispatch('IDLE')
        return
      }

      this.dispatch('IDLE')
    })()
  }

  getCacheKey(
    sequence: string | BigInt | undefined | null,
    hash: string | Buffer | null,
  ): string {
    if (Buffer.isBuffer(hash)) {
      return `${hash.toString('hex') || ''}-${sequence?.toString() || ''}`.toLowerCase()
    }
    return `${hash || ''}-${sequence?.toString() || ''}`.toLowerCase()
  }

  async getBlock(
    sequence: BigInt | null,
    hash: Buffer,
  ): Promise<Block<E, H, T, SE, SH, ST> | null> {
    const cacheKey = this.getCacheKey(sequence, hash)

    const cachedBlock = this.recentBlocks.get(cacheKey)

    if (cachedBlock) {
      return cachedBlock
    } else {
      const block = await this.chain.getBlock(hash)
      if (block) this.recentBlocks.set(cacheKey, block)
      return block
    }
  }
}
