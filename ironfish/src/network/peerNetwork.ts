/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { RollingFilter } from '@ironfish/rust-nodejs'
import LRU from 'blru'
import { BufferMap } from 'buffer-map'
import { Assert } from '../assert'
import { Blockchain } from '../blockchain'
import { MAX_REQUESTED_BLOCKS, VerificationResultReason } from '../consensus'
import { Event } from '../event'
import { DEFAULT_WEBSOCKET_PORT } from '../fileStores/config'
import { HostsStore } from '../fileStores/hosts'
import { createRootLogger, Logger } from '../logger'
import { MetricsMonitor } from '../metrics'
import { IronfishNode } from '../node'
import { IronfishPKG } from '../package'
import { Platform } from '../platform'
import { Transaction } from '../primitives'
import { Block, CompactBlock } from '../primitives/block'
import { BlockHash, BlockHeader } from '../primitives/blockheader'
import { TransactionHash } from '../primitives/transaction'
import { Telemetry } from '../telemetry'
import { ArrayUtils, BenchUtils, HRTime } from '../utils'
import { BlockFetcher } from './blockFetcher'
import { Identity, PrivateIdentity } from './identity'
import { CannotSatisfyRequest } from './messages/cannotSatisfyRequest'
import { DisconnectingMessage, DisconnectingReason } from './messages/disconnecting'
import { GetBlockHashesRequest, GetBlockHashesResponse } from './messages/getBlockHashes'
import { GetBlocksRequest, GetBlocksResponse } from './messages/getBlocks'
import {
  GetBlockTransactionsRequest,
  GetBlockTransactionsResponse,
} from './messages/getBlockTransactions'
import { GetCompactBlockRequest, GetCompactBlockResponse } from './messages/getCompactBlock'
import {
  displayNetworkMessageType,
  IncomingPeerMessage,
  NetworkMessage,
} from './messages/networkMessage'
import { NewBlockHashesMessage } from './messages/newBlockHashes'
import { NewBlockV2Message } from './messages/newBlockV2'
import { NewPooledTransactionHashes } from './messages/newPooledTransactionHashes'
import { NewTransactionV2Message } from './messages/newTransactionV2'
import {
  PooledTransactionsRequest,
  PooledTransactionsResponse,
} from './messages/pooledTransactions'
import {
  Direction,
  RPC_TIMEOUT_MILLIS,
  RpcId,
  RpcNetworkMessage,
} from './messages/rpcNetworkMessage'
import {
  CannotSatisfyRequestError,
  NetworkError,
  RequestTimeoutError,
} from './peers/connections'
import { LocalPeer } from './peers/localPeer'
import { BAN_SCORE, KnownBlockHashesValue, Peer } from './peers/peer'
import { PeerConnectionManager } from './peers/peerConnectionManager'
import { PeerManager } from './peers/peerManager'
import { TransactionFetcher } from './transactionFetcher'
import { IsomorphicWebSocketConstructor } from './types'
import { parseUrl } from './utils/parseUrl'
import { VERSION_PROTOCOL } from './version'
import { WebSocketServer } from './webSocketServer'

/**
 * We store gossips that have already been seen and processed, and ignore them
 * if we have seen them before. The set that contains these gossips is
 * bounded to a specific size and old ones are evicted in the order
 * they were inserted.
 */
const GOSSIP_FILTER_SIZE = 100000
const GOSSIP_FILTER_FP_RATE = 0.000001

const MAX_GET_BLOCK_TRANSACTIONS_DEPTH = 10
const MAX_GET_COMPACT_BLOCK_DEPTH = 5

type RpcRequest = {
  resolve: (value: IncomingPeerMessage<RpcNetworkMessage>) => void
  reject: (e: unknown) => void
  peer: Peer
  messageType: number
  startTime: HRTime
}

export type TransactionOrHash =
  | { type: 'FULL'; value: Transaction }
  | { type: 'HASH'; value: TransactionHash }

interface Indexable {
  index: number
}

/**
 * Entry point for the peer-to-peer network. Manages connections to other peers on the network
 * and provides abstractions for several methods of sending/receiving network messages.
 */
export class PeerNetwork {
  // optional WebSocket server, started from Node.JS
  private webSocketServer?: WebSocketServer

  readonly localPeer: LocalPeer
  readonly peerManager: PeerManager
  readonly onIsReadyChanged = new Event<[boolean]>()
  readonly onTransactionAccepted = new Event<[transaction: Transaction, received: Date]>()
  readonly onBlockGossipReceived = new Event<[BlockHeader]>()

  private started = false
  private readonly minPeers: number
  private readonly bootstrapNodes: string[]
  private readonly listen: boolean
  private readonly peerConnectionManager: PeerConnectionManager
  private readonly logger: Logger
  private readonly metrics: MetricsMonitor
  private readonly telemetry: Telemetry
  private readonly node: IronfishNode
  private readonly chain: Blockchain
  private readonly requests: Map<RpcId, RpcRequest>
  private readonly enableSyncing: boolean

  private readonly blockFetcher: BlockFetcher
  private readonly transactionFetcher: TransactionFetcher

  // A cache that keeps track of transactions that are a part of recently confirmed blocks
  // TODO(daniel): Consider replacing this with a nullifier check. This would filter out transactions
  // that have overlapping nullifiers in the chain so we don't process those invalid transactions
  private readonly recentlyAddedToChain: LRU<TransactionHash, boolean> = new LRU<
    TransactionHash,
    boolean
  >(300 * 60, null, BufferMap)

  // A cache that keeps track of which peers have seen which transactions. This allows
  // us to not send the same transaction to a peer more than once. TODO(daniel): We want to
  // change this to use an RLU cache so that we don't get false positives
  private readonly knownTransactionFilter: RollingFilter = new RollingFilter(
    GOSSIP_FILTER_SIZE * 50,
    GOSSIP_FILTER_FP_RATE,
  )

  /**
   * If the peer network is ready for messages to be sent or not
   */
  private _isReady = false
  get isReady(): boolean {
    return this._isReady
  }

  constructor(options: {
    identity: PrivateIdentity
    agent?: string
    webSocket: IsomorphicWebSocketConstructor
    listen?: boolean
    port?: number
    bootstrapNodes?: string[]
    name?: string | null
    maxPeers?: number
    minPeers?: number
    targetPeers?: number
    enableSyncing?: boolean
    logPeerMessages?: boolean
    simulateLatency?: number
    logger?: Logger
    metrics?: MetricsMonitor
    telemetry: Telemetry
    node: IronfishNode
    chain: Blockchain
    hostsStore: HostsStore
  }) {
    this.enableSyncing = options.enableSyncing ?? true
    this.node = options.node
    this.chain = options.chain
    this.logger = (options.logger || createRootLogger()).withTag('peernetwork')
    this.metrics = options.metrics || new MetricsMonitor({ logger: this.logger })
    this.telemetry = options.telemetry
    this.bootstrapNodes = options.bootstrapNodes || []

    this.localPeer = new LocalPeer(
      options.identity,
      options.agent || Platform.getAgent(IronfishPKG),
      VERSION_PROTOCOL,
      options.chain,
      options.webSocket,
    )

    this.localPeer.port = options.port === undefined ? null : options.port
    this.localPeer.name = options.name || null
    this.localPeer.simulateLatency = options.simulateLatency || 0

    const maxPeers = options.maxPeers || 10000
    const targetPeers = options.targetPeers || 50
    const logPeerMessages = options.logPeerMessages ?? false

    this.peerManager = new PeerManager(
      this.localPeer,
      options.hostsStore,
      this.logger,
      this.metrics,
      maxPeers,
      targetPeers,
      logPeerMessages,
    )
    this.peerManager.onMessage.on((peer, message) => this.handleMessage(peer, message))
    this.peerManager.onConnectedPeersChanged.on(() => {
      this.metrics.p2p_PeersCount.value = this.peerManager.getConnectedPeers().length
      this.updateIsReady()
    })

    this.peerConnectionManager = new PeerConnectionManager(this.peerManager, this.logger, {
      maxPeers,
    })

    this.minPeers = options.minPeers || 1
    this.listen = options.listen === undefined ? true : options.listen

    this.requests = new Map<RpcId, RpcRequest>()

    if (options.name && options.name.length > 32) {
      options.name = options.name.slice(32)
    }

    this.blockFetcher = new BlockFetcher(this)
    this.transactionFetcher = new TransactionFetcher(this)

    this.chain.onConnectBlock.on((block) => {
      this.blockFetcher.removeBlock(block.header.hash)
      for (const transaction of block.transactions) {
        this.recentlyAddedToChain.set(transaction.hash(), true)
      }
    })

    this.chain.onForkBlock.on((block) => {
      this.blockFetcher.removeBlock(block.header.hash)
    })

    this.chain.onDisconnectBlock.on((block) => {
      for (const transaction of block.transactions) {
        this.recentlyAddedToChain.remove(transaction.hash())
      }
    })

    this.node.miningManager.onNewBlock.on((block) => {
      this.broadcastBlock(block)
      this.broadcastBlockHash(block.header)
    })

    this.node.wallet.onBroadcastTransaction.on((transaction) => {
      this.broadcastTransaction(transaction)
    })
  }

  start(): void {
    if (this.started) {
      return
    }
    this.started = true

    // Start the WebSocket server if possible
    if (this.listen && 'Server' in this.localPeer.webSocket && this.localPeer.port !== null) {
      this.webSocketServer = new WebSocketServer(
        this.localPeer.webSocket.Server,
        this.localPeer.port,
      )

      this.webSocketServer.onStart(() => {
        const address = this.webSocketServer?.server.address()
        const addressStr =
          typeof address === 'object' ? `${address.address}:${address.port}` : String(address)
        this.logger.info(`WebSocket server started at ${addressStr}`)
      })

      this.webSocketServer.onConnection((connection, req) => {
        let address: string | null = null

        if (this.peerManager.shouldRejectDisconnectedPeers()) {
          this.logger.debug(
            'Disconnecting inbound websocket connection because the node has max peers',
          )

          const disconnect = new DisconnectingMessage({
            destinationIdentity: null,
            disconnectUntil: this.peerManager.getCongestedDisconnectUntilTimestamp(),
            reason: DisconnectingReason.Congested,
            sourceIdentity: this.localPeer.publicIdentity,
          })
          connection.send(disconnect.serializeWithMetadata())
          connection.close()
          return
        }

        if (req.headers['X-Forwarded-For'] && req.headers['X-Forwarded-For'][0]) {
          address = req.headers['X-Forwarded-For'][0]
        } else if (req.socket.remoteAddress) {
          address = req.socket.remoteAddress
        }

        if (address) {
          // Some times local peers connect on IPV6 incompatible addresses like
          // '::ffff:127.0.0.1' and we don't support connecting over IPv6 right now
          address = address.replace('::ffff:', '')
        }

        this.peerManager.createPeerFromInboundWebSocketConnection(connection, address)
      })

      this.peerManager.onConnect.on((peer: Peer) => {
        this.logger.debug(`Connected to ${peer.getIdentityOrThrow()}`)
      })

      this.peerManager.onDisconnect.on((peer: Peer) => {
        this.logger.debug(`Disconnected from ${String(peer.state.identity)}`)
      })

      this.onIsReadyChanged.on((isReady: boolean) => {
        if (isReady) {
          this.logger.info(`Connected to the Iron Fish network`)
          this.node.onPeerNetworkReady()
        } else {
          this.logger.info(`Not connected to the Iron Fish network`)
          this.node.onPeerNetworkNotReady()
        }
      })
    }

    // Start up the PeerManager
    this.peerManager.start()

    // Start up the PeerConnectionManager
    this.peerConnectionManager.start()

    this.updateIsReady()

    for (const node of this.bootstrapNodes) {
      const url = parseUrl(node)

      if (!url.hostname) {
        throw new Error(
          `Could not determine a hostname for bootstrap node "${node}". Is it formatted correctly?`,
        )
      }

      // If the user has not specified a port, we can guess that
      // it's running on the default ironfish websocket port
      const port = url.port ? url.port : DEFAULT_WEBSOCKET_PORT
      const address = url.hostname + `:${port}`
      this.peerManager.connectToWebSocketAddress(address, true)
    }
  }

  /**
   * Call close when shutting down the PeerNetwork to clean up
   * outstanding connections.
   */
  async stop(): Promise<void> {
    this.started = false
    this.peerConnectionManager.stop()
    await this.peerManager.stop()
    this.webSocketServer?.close()
    this.updateIsReady()
    this.blockFetcher.stop()
    this.transactionFetcher.stop()
  }

  /**
   * Send a compact block to a sqrt subset of peers who haven't yet received the block
   */
  private broadcastBlock(block: Block): void {
    const hash = block.header.hash

    const peersToSendToArray = ArrayUtils.shuffle([...this.connectedPeersWithoutBlock(hash)])

    const sqrtSize = Math.floor(Math.sqrt(peersToSendToArray.length))

    const compactBlockMessage = new NewBlockV2Message(block.toCompactBlock())

    // Send compact block to random subset of sqrt of peers
    for (const peer of peersToSendToArray.slice(0, sqrtSize)) {
      if (peer.send(compactBlockMessage)) {
        peer.knownBlockHashes.set(hash, KnownBlockHashesValue.Sent)
      }
    }
  }

  /**
   * Send a block hash to all connected peers who haven't yet received the block.
   */
  private broadcastBlockHash(header: BlockHeader): void {
    const hashMessage = new NewBlockHashesMessage([
      { hash: header.hash, sequence: header.sequence },
    ])

    for (const peer of this.connectedPeersWithoutBlock(header.hash)) {
      if (peer.send(hashMessage)) {
        peer.knownBlockHashes.set(header.hash, KnownBlockHashesValue.Sent)
      }
    }
  }

  private broadcastTransaction(transaction: Transaction): void {
    const hash = transaction.hash()

    const peersToSendToArray = ArrayUtils.shuffle([
      ...this.connectedPeersWithoutTransaction(hash),
    ])

    const sqrtSize = Math.floor(Math.sqrt(peersToSendToArray.length))

    const fullTransactionMessage = new NewTransactionV2Message([transaction])
    const hashMessage = new NewPooledTransactionHashes([hash])

    // Send full transaction to random subset of sqrt of peers
    for (const peer of peersToSendToArray.slice(0, sqrtSize)) {
      if (peer.state.type !== 'CONNECTED') {
        continue
      }

      if (peer.send(fullTransactionMessage)) {
        this.markKnowsTransaction(hash, peer.state.identity)
      }
    }

    // Send just the hash to the remaining peers
    for (const peer of peersToSendToArray.slice(sqrtSize)) {
      if (peer.state.type !== 'CONNECTED') {
        continue
      }

      if (peer.send(hashMessage)) {
        this.markKnowsTransaction(hash, peer.state.identity)
      }
    }
  }

  knowsTransaction(hash: TransactionHash, peerId: Identity): boolean {
    const toTest = Buffer.concat([hash, Buffer.from(peerId)])
    return this.knownTransactionFilter.test(toTest)
  }

  private markKnowsTransaction(hash: TransactionHash, peerId: Identity): void {
    const toAdd = Buffer.concat([hash, Buffer.from(peerId)])
    this.knownTransactionFilter.add(toAdd)
  }

  private *connectedPeersWithoutTransaction(hash: TransactionHash): Generator<Peer> {
    for (const p of this.peerManager.identifiedPeers.values()) {
      if (p.state.type === 'CONNECTED' && !this.knowsTransaction(hash, p.state.identity)) {
        yield p
      }
    }
  }

  private *connectedPeersWithoutBlock(hash: BlockHash): Generator<Peer> {
    for (const p of this.peerManager.identifiedPeers.values()) {
      if (p.state.type === 'CONNECTED' && !p.knownBlockHashes.has(hash)) {
        yield p
      }
    }
  }

  /**
   * Fire an RPC request to the given peer identity. Returns a promise that
   * will resolve when the response is received, or will be rejected if the
   * request cannot be completed before timing out.
   */
  private requestFrom(
    peer: Peer,
    message: RpcNetworkMessage,
  ): Promise<IncomingPeerMessage<RpcNetworkMessage>> {
    const rpcId = message.rpcId

    return new Promise<IncomingPeerMessage<RpcNetworkMessage>>((resolve, reject) => {
      // Reject requests if the connection becomes disconnected
      const onConnectionStateChanged = () => {
        const request = this.requests.get(rpcId)

        if (request && request.peer.state.type === 'DISCONNECTED') {
          request.peer.onStateChanged.off(onConnectionStateChanged)

          const errorMessage = `Connection closed while waiting for request ${displayNetworkMessageType(
            message.type,
          )}: ${rpcId}`

          request.reject(new NetworkError(errorMessage))
        }
      }

      const clearDisconnectHandler = (): void => {
        this.requests.get(rpcId)?.peer.onStateChanged.off(onConnectionStateChanged)
      }

      const timeout = setTimeout(() => {
        const request = this.requests.get(rpcId)
        if (!request) {
          throw new Error(`Timed out request ${rpcId} not found`)
        }
        const errorMessage = `Closing connections to ${
          peer.displayName
        } because RPC message of type ${displayNetworkMessageType(
          message.type,
        )} timed out after ${RPC_TIMEOUT_MILLIS} ms in request: ${rpcId}.`
        const error = new RequestTimeoutError(RPC_TIMEOUT_MILLIS, errorMessage)
        this.logger.debug(errorMessage)
        clearDisconnectHandler()
        peer.close(error)
        request.reject(error)
      }, RPC_TIMEOUT_MILLIS)

      const request: RpcRequest = {
        resolve: (message: IncomingPeerMessage<RpcNetworkMessage>): void => {
          clearDisconnectHandler()
          peer.pendingRPC--
          this.requests.delete(rpcId)
          clearTimeout(timeout)

          const endTime = BenchUtils.end(request.startTime)
          this.metrics.p2p_RpcResponseTimeMsByMessage.get(request.messageType)?.add(endTime)
          this.metrics.p2p_RpcSuccessRateByMessage.get(request.messageType)?.add(1)

          resolve(message)
        },
        reject: (reason?: unknown): void => {
          clearDisconnectHandler()
          peer.pendingRPC--
          this.requests.delete(rpcId)
          clearTimeout(timeout)

          this.metrics.p2p_RpcSuccessRateByMessage.get(request.messageType)?.add(0)

          reject(reason)
        },
        peer: peer,
        messageType: message.type,
        startTime: BenchUtils.start(),
      }

      peer.pendingRPC++
      this.requests.set(rpcId, request)

      const connection = peer.send(message)
      if (!connection) {
        return request.reject(
          new Error(
            `${String(peer.state.identity)} did not send ${displayNetworkMessageType(
              message.type,
            )} in state ${peer.state.type}`,
          ),
        )
      }

      peer.onStateChanged.on(onConnectionStateChanged)
    })
  }

  async getBlockHashes(
    peer: Peer,
    start: number,
    limit: number,
  ): Promise<{ hashes: Buffer[]; time: number }> {
    const begin = BenchUtils.start()

    const message = new GetBlockHashesRequest(start, limit)
    const response = await this.requestFrom(peer, message)

    if (!(response.message instanceof GetBlockHashesResponse)) {
      // TODO jspafford: disconnect peer, or handle it more properly
      throw new Error(
        `Invalid GetBlockHashesResponse: ${displayNetworkMessageType(message.type)}`,
      )
    }

    return { hashes: response.message.hashes, time: BenchUtils.end(begin) }
  }

  async getBlocks(
    peer: Peer,
    start: Buffer,
    limit: number,
  ): Promise<{ blocks: Block[]; time: number }> {
    const begin = BenchUtils.start()

    const message = new GetBlocksRequest(start, limit)
    const response = await this.requestFrom(peer, message)

    if (!(response.message instanceof GetBlocksResponse)) {
      // TODO jspafford: disconnect peer, or handle it more properly
      throw new Error(`Invalid GetBlocksResponse: ${displayNetworkMessageType(message.type)}`)
    }

    return { blocks: response.message.blocks, time: BenchUtils.end(begin) }
  }

  private async handleMessage(
    peer: Peer,
    incomingMessage: IncomingPeerMessage<NetworkMessage>,
  ): Promise<void> {
    const { message } = incomingMessage

    if (message instanceof RpcNetworkMessage) {
      await this.handleRpcMessage(peer, message)
    } else if (message instanceof NewBlockHashesMessage) {
      await this.handleNewBlockHashesMessage(peer, message)
    } else if (message instanceof NewBlockV2Message) {
      await this.onNewCompactBlock(peer, message.compactBlock)
    } else if (message instanceof NewPooledTransactionHashes) {
      this.handleNewPooledTransactionHashes(peer, message)
    } else if (message instanceof NewTransactionV2Message) {
      for (const transaction of message.transactions) {
        await this.onNewTransaction(peer, transaction)
      }
    } else {
      throw new Error(
        `Invalid message for handling in peer network: '${displayNetworkMessageType(
          incomingMessage.message.type,
        )}'`,
      )
    }
  }

  /**
   * Handle an incoming RPC message. This may be an incoming request for some
   * data, or an incoming response to one of our requests.
   *
   * If it is a request, we pass it to the handler registered for it.
   * If a response, we resolve the promise waiting for it.
   *
   * The handler for a given request should either return a payload or throw
   * a CannotSatisfyRequest error
   */
  private async handleRpcMessage(peer: Peer, rpcMessage: RpcNetworkMessage): Promise<void> {
    const rpcId = rpcMessage.rpcId
    const peerIdentity = peer.getIdentityOrThrow()

    if (rpcMessage.direction === Direction.Request) {
      let responseMessage: RpcNetworkMessage
      try {
        if (rpcMessage instanceof GetBlockHashesRequest) {
          responseMessage = await this.onGetBlockHashesRequest({
            peerIdentity,
            message: rpcMessage,
          })
        } else if (rpcMessage instanceof GetBlocksRequest) {
          responseMessage = await this.onGetBlocksRequest({ peerIdentity, message: rpcMessage })
        } else if (rpcMessage instanceof PooledTransactionsRequest) {
          responseMessage = this.onPooledTransactionsRequest(rpcMessage, rpcId)
        } else if (rpcMessage instanceof GetBlockTransactionsRequest) {
          responseMessage = await this.onGetBlockTransactionsRequest(peer, rpcMessage)
        } else if (rpcMessage instanceof GetCompactBlockRequest) {
          responseMessage = await this.onGetCompactBlockRequest(rpcMessage)
        } else {
          throw new Error(`Invalid rpc message type: '${rpcMessage.type}'`)
        }
      } catch (error: unknown) {
        const asError = error as Error
        if (!(asError.name && asError.name === 'CannotSatisfyRequestError')) {
          this.logger.error(
            `Unexpected error in ${displayNetworkMessageType(
              rpcMessage.type,
            )} handler: ${String(error)}`,
          )
        }
        responseMessage = new CannotSatisfyRequest(rpcId)
      }

      const sent = peer.send(responseMessage)
      if (
        sent &&
        responseMessage instanceof PooledTransactionsResponse &&
        peer.state.identity
      ) {
        for (const transaction of responseMessage.transactions) {
          const hash = transaction.hash()
          this.markKnowsTransaction(hash, peer.state.identity)
        }
      }
    } else {
      const request = this.requests.get(rpcId)
      if (request) {
        request.resolve({ peerIdentity, message: rpcMessage })
      } else if (rpcMessage instanceof PooledTransactionsResponse) {
        for (const transaction of rpcMessage.transactions) {
          await this.onNewTransaction(peer, transaction)
        }
      } else if (rpcMessage instanceof GetBlockTransactionsResponse) {
        await this.onNewBlockTransactions(peer, rpcMessage)
      } else if (rpcMessage instanceof GetCompactBlockResponse) {
        await this.onNewCompactBlock(peer, rpcMessage.compactBlock)
      } else if (rpcMessage instanceof GetBlocksResponse) {
        // Should happen when block is requested directly by the block fetcher
        for (const block of rpcMessage.blocks) {
          await this.handleRequestedBlock(peer, block)
        }
      }
    }
  }

  private async handleNewBlockHashesMessage(peer: Peer, message: NewBlockHashesMessage) {
    if (!this.shouldProcessNewBlocks()) {
      return
    }

    for (const { hash, sequence } of message.blockHashInfos) {
      peer.knownBlockHashes.set(hash, KnownBlockHashesValue.Received)

      if (peer.sequence === null || sequence > peer.sequence) {
        peer.sequence = sequence
      }

      // Request blocks that can be fetched as compact blocks, and that we don't already have.
      // NOTE: It may be possible to start syncing from peers who send hashes with a sequence
      // greater than 1 ahead of our chain head, but consider also adding protection against
      // peers who send hashes that map to invalid blocks.
      if (
        sequence >= this.chain.head.sequence - MAX_GET_COMPACT_BLOCK_DEPTH &&
        !(await this.alreadyHaveBlock(hash))
      ) {
        this.blockFetcher.receivedHash(hash, peer)
      }
    }
  }

  private *fromDifferentialIndex<T extends Indexable>(list: T[]): Generator<T> {
    let previousPos = -1
    for (const elem of list) {
      const absolutePos = previousPos + elem.index + 1
      yield { ...elem, index: absolutePos }
      previousPos = absolutePos
    }
  }

  private toDifferentialIndex(list: number[]): number[] {
    return list.map((val, i) => {
      return i === 0 ? val : val - list[i - 1] - 1
    })
  }

  private assembleTransactionsFromMempool(block: CompactBlock):
    | {
        ok: true
        partialTransactions: TransactionOrHash[]
        missingTransactions: number[]
      }
    | { ok: false } {
    const absoluteIndexTransactions = this.fromDifferentialIndex(block.transactions)

    const numHashes = block.transactionHashes.length
    let hashesConsumed = 0
    let fullTransactionsConsumed = 0
    let nextFullTransaction = absoluteIndexTransactions.next()

    const partialTransactions: TransactionOrHash[] = []
    const absoluteMissingTransactions: number[] = []

    while (hashesConsumed < numHashes || !nextFullTransaction.done) {
      const currPosition = hashesConsumed + fullTransactionsConsumed

      // If we have no more full transactions or a transaction doesn't belong in this position
      if (nextFullTransaction.done || currPosition !== nextFullTransaction.value.index) {
        if (hashesConsumed === numHashes) {
          // We ran out of hashes to populate
          return { ok: false }
        }

        const hash = block.transactionHashes[hashesConsumed]
        const transaction = this.node.memPool.get(hash)
        const resolved: TransactionOrHash = transaction
          ? {
              type: 'FULL',
              value: transaction,
            }
          : {
              type: 'HASH',
              value: hash,
            }
        if (resolved.type === 'HASH') {
          absoluteMissingTransactions.push(currPosition)
        }

        partialTransactions.push(resolved)
        hashesConsumed++
        continue
      }

      partialTransactions.push({
        type: 'FULL',
        value: nextFullTransaction.value.transaction,
      })
      nextFullTransaction = absoluteIndexTransactions.next()
      fullTransactionsConsumed++
    }

    return {
      ok: true,
      partialTransactions,
      missingTransactions: this.toDifferentialIndex(absoluteMissingTransactions),
    }
  }

  assembleBlockFromResponse(
    partialTransactions: TransactionOrHash[],
    responseTransactions: readonly Transaction[],
  ): { ok: false } | { ok: true; transactions: Transaction[] } {
    const transactions: Transaction[] = []
    let currResponseIndex = 0

    for (const partial of partialTransactions) {
      if (partial.type === 'FULL') {
        transactions.push(partial.value)
      } else if (currResponseIndex >= responseTransactions.length) {
        // did not respond with enough transactions
        return { ok: false }
      } else {
        const next = responseTransactions[currResponseIndex]
        if (!next.hash().equals(partial.value)) {
          // hashes are mismatched
          return { ok: false }
        }
        transactions.push(next)
        currResponseIndex++
      }
    }

    return { ok: true, transactions }
  }

  private async onNewBlockTransactions(peer: Peer, message: GetBlockTransactionsResponse) {
    const block = this.blockFetcher.receivedBlockTransactions(message)

    if (!block) {
      return
    }

    // if we don't have the previous block, start syncing
    const prevHeader = await this.chain.getHeader(block.header.previousBlockHash)
    if (prevHeader === null) {
      this.chain.addOrphan(block.header)
      this.blockFetcher.removeBlock(block.header.hash)
      this.node.syncer.startSync(peer)
      return
    }

    await this.onNewFullBlock(peer, block, prevHeader)
  }

  private async onNewCompactBlock(peer: Peer, compactBlock: CompactBlock) {
    if (!this.shouldProcessNewBlocks()) {
      return
    }

    // mark the block as received in the block fetcher and decide whether to continue
    // to validate this compact block or not
    const shouldProcess = this.blockFetcher.receivedCompactBlock(compactBlock, peer)
    if (!shouldProcess) {
      return
    }

    // verify the header
    const header = compactBlock.header
    const verifyHeaderResult = this.chain.verifier.verifyBlockHeader(header)
    if (!verifyHeaderResult.valid) {
      this.chain.addInvalid(
        header.hash,
        verifyHeaderResult.reason ?? VerificationResultReason.ERROR,
      )
      this.blockFetcher.removeBlock(header.hash)
      return
    }

    if (await this.alreadyHaveBlock(header)) {
      this.blockFetcher.removeBlock(header.hash)
      return
    }

    // set values on the peer to indicate the peer has the block
    if (peer.sequence === null || header.sequence > peer.sequence) {
      peer.sequence = header.sequence
    }

    // this might overwrite the existing value if we've already sent the
    // block to the peer, but the value isn't important
    peer.knownBlockHashes.set(header.hash, KnownBlockHashesValue.Received)

    this.onBlockGossipReceived.emit(header)

    // if we don't have the previous block, start syncing
    const prevHeader = await this.chain.getHeader(header.previousBlockHash)
    if (prevHeader === null) {
      this.chain.addOrphan(header)
      this.blockFetcher.removeBlock(header.hash)
      this.node.syncer.startSync(peer)
      return
    }

    // since we have the previous block, do contextual verification
    const { valid, reason } = this.chain.verifier.verifyBlockHeaderContextual(
      header,
      prevHeader,
    )
    if (!valid) {
      this.chain.addInvalid(header.hash, reason ?? VerificationResultReason.ERROR)
      this.blockFetcher.removeBlock(header.hash)
      return
    }

    // check if we're missing transactions
    const result = this.assembleTransactionsFromMempool(compactBlock)

    if (!result.ok) {
      peer.punish(BAN_SCORE.MAX)
      this.blockFetcher.requestFullBlock(header.hash)
      return
    }

    const { missingTransactions, partialTransactions } = result

    // log telemetry on how many transactions we already had in our the mempool
    // or on the compact block's transactions field
    this.telemetry.submitCompactBlockAssembled(
      header,
      missingTransactions.length,
      compactBlock.transactionHashes.length - missingTransactions.length, // number populated from mempool
    )

    if (result.missingTransactions.length > 0) {
      this.blockFetcher.requestBlockTransactions(
        peer,
        header,
        partialTransactions,
        missingTransactions,
      )
      return
    }

    const fullTransactions: Transaction[] = []
    for (const partial of partialTransactions) {
      partial.type === 'FULL' && fullTransactions.push(partial.value)
    }

    const fullBlock = new Block(compactBlock.header, fullTransactions)
    await this.onNewFullBlock(peer, fullBlock, prevHeader)
  }

  private handleNewPooledTransactionHashes(peer: Peer, message: NewPooledTransactionHashes) {
    if (!this.shouldProcessTransactions()) {
      return
    }

    for (const hash of message.hashes) {
      peer.state.identity && this.markKnowsTransaction(hash, peer.state.identity)

      // If the transaction is already in the mempool the only thing we have to do is broadcast
      const transaction = this.node.memPool.get(hash)
      if (transaction && !this.alreadyHaveTransaction(hash)) {
        this.broadcastTransaction(transaction)
      } else {
        this.transactionFetcher.hashReceived(hash, peer)
      }
    }
  }

  private updateIsReady(): void {
    const prevIsReady = this._isReady
    this._isReady = this.started && this.peerManager.getConnectedPeers().length >= this.minPeers

    if (this._isReady !== prevIsReady) {
      this.onIsReadyChanged.emit(this._isReady)
    }
  }

  private async resolveSequenceOrHash(start: Buffer | number): Promise<BlockHeader | null> {
    if (Buffer.isBuffer(start)) {
      return await this.chain.getHeader(start)
    }

    return await this.chain.getHeaderAtSequence(start)
  }

  private async onGetBlockHashesRequest(
    request: IncomingPeerMessage<GetBlockHashesRequest>,
  ): Promise<GetBlockHashesResponse> {
    const peer = this.peerManager.getPeerOrThrow(request.peerIdentity)
    const rpcId = request.message.rpcId

    if (request.message.limit <= 0) {
      peer.punish(
        BAN_SCORE.LOW,
        `Peer sent GetBlockHashes with limit of ${request.message.limit}`,
      )
      return new GetBlockHashesResponse([], rpcId)
    }

    if (request.message.limit > MAX_REQUESTED_BLOCKS) {
      peer.punish(
        BAN_SCORE.MAX,
        `Peer sent GetBlockHashes with limit of ${request.message.limit}`,
      )
      const error = new CannotSatisfyRequestError(`Requested more than ${MAX_REQUESTED_BLOCKS}`)
      throw error
    }

    const message = request.message
    const start = message.start
    const limit = message.limit

    const from = await this.resolveSequenceOrHash(start)
    if (!from) {
      return new GetBlockHashesResponse([], rpcId)
    }

    const hashes = []

    for await (const hash of this.chain.iterateToHashes(from)) {
      hashes.push(hash)
      if (hashes.length === limit) {
        break
      }
    }

    return new GetBlockHashesResponse(hashes, rpcId)
  }

  private async onGetBlocksRequest(
    request: IncomingPeerMessage<GetBlocksRequest>,
  ): Promise<GetBlocksResponse> {
    const peer = this.peerManager.getPeerOrThrow(request.peerIdentity)
    const rpcId = request.message.rpcId

    if (request.message.limit === 0) {
      peer.punish(BAN_SCORE.LOW, `Peer sent GetBlocks with limit of ${request.message.limit}`)
      return new GetBlocksResponse([], rpcId)
    }

    if (request.message.limit > MAX_REQUESTED_BLOCKS) {
      peer.punish(BAN_SCORE.MAX, `Peer sent GetBlocks with limit of ${request.message.limit}`)
      const error = new CannotSatisfyRequestError(`Requested more than ${MAX_REQUESTED_BLOCKS}`)
      throw error
    }

    const message = request.message
    const start = message.start
    const limit = message.limit

    const from = await this.resolveSequenceOrHash(start)
    if (!from) {
      return new GetBlocksResponse([], rpcId)
    }

    const hashes = []
    for await (const hash of this.chain.iterateToHashes(from)) {
      hashes.push(hash)
      if (hashes.length === limit) {
        break
      }
    }

    const blocks = await Promise.all(hashes.map((hash) => this.chain.getBlock(hash)))

    const notNullBlocks = blocks.map((block) => {
      Assert.isNotNull(block)
      return block
    })

    return new GetBlocksResponse(notNullBlocks, rpcId)
  }

  private onPooledTransactionsRequest(
    message: PooledTransactionsRequest,
    rpcId: number,
  ): PooledTransactionsResponse {
    const transactions: Transaction[] = []

    for (const hash of message.transactionHashes) {
      const transaction = this.node.memPool.get(hash)
      if (transaction) {
        transactions.push(transaction)
      }
    }

    return new PooledTransactionsResponse(transactions, rpcId)
  }

  private async onGetBlockTransactionsRequest(
    peer: Peer,
    message: GetBlockTransactionsRequest,
  ): Promise<GetBlockTransactionsResponse> {
    let block = this.blockFetcher.getFullBlock(message.blockHash)

    if (block === null) {
      block = await this.chain.db.withTransaction(null, async (tx) => {
        const header = await this.chain.getHeader(message.blockHash, tx)

        if (header === null) {
          throw new CannotSatisfyRequestError(
            `Peer requested transactions for block ${message.blockHash.toString(
              'hex',
            )} that isn't in the database`,
          )
        }

        if (header.sequence < this.chain.head.sequence - MAX_GET_BLOCK_TRANSACTIONS_DEPTH) {
          throw new CannotSatisfyRequestError(
            `Peer requested transactions for block ${message.blockHash.toString(
              'hex',
            )} with sequence ${header.sequence} while chain head is at sequence ${
              this.chain.head.sequence
            }`,
          )
        }

        const block = await this.chain.getBlock(header, tx)

        Assert.isNotNull(
          block,
          'Database should contain transactions if it contains block header',
        )

        return block
      })
    }

    if (message.transactionIndexes.length > block.transactions.length) {
      const errorMessage = `Requested ${
        message.transactionIndexes.length
      } transactions for block ${block.header.hash.toString('hex')} that contains ${
        block.transactions.length
      } transactions`
      throw new CannotSatisfyRequestError(errorMessage)
    }

    const transactions = []
    let currentIndex = 0
    for (const transactionIndex of message.transactionIndexes) {
      if (transactionIndex < 0) {
        const errorMessage = `Requested negative transaction index`
        throw new CannotSatisfyRequestError(errorMessage)
      }

      currentIndex += transactionIndex

      if (currentIndex >= block.transactions.length) {
        const errorMessage = `Requested transaction index past the end of the block's transactions`
        throw new CannotSatisfyRequestError(errorMessage)
      }

      transactions.push(block.transactions[currentIndex])
      currentIndex++
    }

    return new GetBlockTransactionsResponse(message.blockHash, transactions, message.rpcId)
  }

  private async onGetCompactBlockRequest(
    message: GetCompactBlockRequest,
  ): Promise<GetCompactBlockResponse> {
    const block = await this.chain.db.withTransaction(null, async (tx) => {
      const header = await this.chain.getHeader(message.blockHash, tx)

      if (header === null) {
        throw new CannotSatisfyRequestError(
          `Peer requested compact block for block ${message.blockHash.toString(
            'hex',
          )} that isn't in the database`,
        )
      }

      if (header.sequence < this.chain.head.sequence - MAX_GET_COMPACT_BLOCK_DEPTH) {
        throw new CannotSatisfyRequestError(
          `Peer requested compact block for ${message.blockHash.toString(
            'hex',
          )} with sequence ${header.sequence} while chain head is at sequence ${
            this.chain.head.sequence
          }`,
        )
      }

      const block = await this.chain.getBlock(header, tx)

      Assert.isNotNull(
        block,
        'Database should contain transactions if it contains block header',
      )

      return block
    })

    return new GetCompactBlockResponse(block.toCompactBlock(), message.rpcId)
  }

  private async handleRequestedBlock(peer: Peer, block: Block) {
    if (!this.shouldProcessNewBlocks()) {
      return
    }

    if (await this.alreadyHaveBlock(block.header)) {
      return
    }

    peer.knownBlockHashes.set(block.header.hash, KnownBlockHashesValue.Received)

    // verify the block header
    const verifyBlockHeaderResult = this.chain.verifier.verifyBlockHeader(block.header)
    if (!verifyBlockHeaderResult.valid) {
      this.chain.addInvalid(
        block.header.hash,
        verifyBlockHeaderResult.reason ?? VerificationResultReason.ERROR,
      )
      this.blockFetcher.removeBlock(block.header.hash)
      return
    }

    if (!peer.sequence || block.header.sequence > peer.sequence) {
      peer.sequence = block.header.sequence
    }

    this.onBlockGossipReceived.emit(block.header)

    // if we don't have the previous block, start syncing
    const prevHeader = await this.chain.getHeader(block.header.previousBlockHash)
    if (prevHeader === null) {
      this.chain.addOrphan(block.header)
      this.blockFetcher.removeBlock(block.header.hash)
      this.node.syncer.startSync(peer)
      return
    }

    await this.onNewFullBlock(peer, block, prevHeader)
  }

  private async onNewFullBlock(
    peer: Peer,
    block: Block,
    prevHeader: BlockHeader,
  ): Promise<void> {
    if (!this.shouldProcessNewBlocks()) {
      return
    }

    // Mark that we've assembled a full block in the block fetcher
    this.blockFetcher.receivedFullBlock(block)

    this.broadcastBlock(block)

    // log that we've validated the block enough to gossip it
    this.telemetry.submitNewBlockSeen(block, new Date())

    // verify the full block
    const verified = await this.chain.verifier.verifyBlockAdd(block, prevHeader)
    if (!verified.valid) {
      this.chain.addInvalid(
        block.header.hash,
        verified.reason ?? VerificationResultReason.ERROR,
      )
      this.blockFetcher.removeBlock(block.header.hash)
      return
    }

    // add the block to the chain
    const result = await this.node.syncer.addBlock(peer, block)

    // We should have checked if the block is an orphan or duplicate already, so we
    // don't have to handle those cases here. If there was a verification error, the
    // chain should have added the block to the invalid set.
    if (result.added) {
      this.broadcastBlockHash(block.header)
    }
  }

  private shouldProcessNewBlocks(): boolean {
    // We drop blocks when we are still initially syncing as they
    // will become loose blocks and we can't verify them
    if (!this.chain.synced && this.node.syncer.loader) {
      return false
    }

    return this.enableSyncing
  }

  private shouldProcessTransactions(): boolean {
    if (!this.enableSyncing) {
      return false
    }

    // Ignore new transactions if the node is still syncing
    //
    // TODO(rohanjadvani): However, it's okay to accept transactions if you are
    // not synced and not syncing. We should update this logic after syncing
    // becomes more reliable
    if (!this.node.chain.synced) {
      return false
    }

    // TODO: We may want to remove this so that transactions still propagate
    // even with a full worker pool
    if (this.node.workerPool.saturated) {
      return false
    }

    return true
  }

  alreadyHaveTransaction(hash: TransactionHash): boolean {
    /*
     * When we receive a new transaction we want to test if we have already processed it yet
     * meaning we have it in the mempool or we have it on a block. */

    let peersToSendTo = false
    for (const _ of this.connectedPeersWithoutTransaction(hash)) {
      peersToSendTo = true
      break
    }

    return (
      this.recentlyAddedToChain.has(hash) || (this.node.memPool.exists(hash) && !peersToSendTo)
      // && TODO(daniel): also filter recently rejected (expired or invalid) transactions
    )
  }

  async alreadyHaveBlock(headerOrHash: BlockHeader | BlockHash): Promise<boolean> {
    const hash = Buffer.isBuffer(headerOrHash) ? headerOrHash : headerOrHash.hash
    if (this.chain.isInvalid(headerOrHash)) {
      return true
    }

    if (this.chain.orphans.has(hash)) {
      return true
    }

    return await this.chain.hasBlock(hash)
  }

  private async onNewTransaction(peer: Peer, transaction: Transaction): Promise<void> {
    const received = new Date()

    // Mark the peer as knowing about the transaction
    const hash = transaction.hash()
    peer.state.identity && this.markKnowsTransaction(hash, peer.state.identity)

    // Let the fetcher know that a transaction was received and we no longer have to query it
    this.transactionFetcher.receivedTransaction(hash)

    if (this.shouldProcessTransactions() && !this.alreadyHaveTransaction(hash)) {
      // Check that the transaction is valid
      const { valid, reason } = await this.chain.verifier.verifyNewTransaction(transaction)

      if (!valid) {
        Assert.isNotUndefined(reason)
        // Logging hash because unsignedHash is slow
        this.logger.debug(`Invalid transaction '${hash.toString('hex')}': ${reason}`)
        this.transactionFetcher.removeTransaction(hash)
        return
      }

      if (await this.node.memPool.acceptTransaction(transaction)) {
        this.onTransactionAccepted.emit(transaction, received)
      }

      // Check 'exists' rather than 'accepted' to allow for rebroadcasting to nodes that
      // may not have seen the transaction yet
      if (this.node.memPool.exists(transaction.hash())) {
        this.broadcastTransaction(transaction)
      }

      // Sync every transaction to the wallet, since senders and recipients may want to know
      // about pending transactions even if they're not accepted to the mempool.
      await this.node.wallet.syncTransaction(transaction, {})
    }

    this.transactionFetcher.removeTransaction(hash)
  }
}
