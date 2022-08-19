/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { RollingFilter } from '@ironfish/bfilter'
import { BoxKeyPair } from '@ironfish/rust-nodejs'
import LRU from 'blru'
import { BufferMap } from 'buffer-map'
import { Assert } from '../assert'
import { Blockchain } from '../blockchain'
import { MAX_REQUESTED_BLOCKS } from '../consensus'
import { Event } from '../event'
import { DEFAULT_WEBSOCKET_PORT } from '../fileStores/config'
import { HostsStore } from '../fileStores/hosts'
import { createRootLogger, Logger } from '../logger'
import { MetricsMonitor } from '../metrics'
import { IronfishNode } from '../node'
import { IronfishPKG } from '../package'
import { Platform } from '../platform'
import { Transaction } from '../primitives'
import { BlockSerde, SerializedBlock } from '../primitives/block'
import { BlockHeader, BlockHeaderSerde } from '../primitives/blockheader'
import { SerializedTransaction, TransactionHash } from '../primitives/transaction'
import { ArrayUtils, ErrorUtils } from '../utils'
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
import { GossipNetworkMessage } from './messages/gossipNetworkMessage'
import {
  displayNetworkMessageType,
  IncomingPeerMessage,
  NetworkMessage,
} from './messages/networkMessage'
import { NewBlockMessage } from './messages/newBlock'
import { NewBlockHashesMessage } from './messages/newBlockHashes'
import { NewBlockV2Message } from './messages/newBlockV2'
import { NewPooledTransactionHashes } from './messages/newPooledTransactionHashes'
import { NewTransactionMessage } from './messages/newTransaction'
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

  private started = false
  private readonly minPeers: number
  private readonly bootstrapNodes: string[]
  private readonly listen: boolean
  private readonly peerConnectionManager: PeerConnectionManager
  private readonly logger: Logger
  private readonly metrics: MetricsMonitor
  private readonly node: IronfishNode
  private readonly chain: Blockchain
  private readonly requests: Map<RpcId, RpcRequest>
  private readonly enableSyncing: boolean

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
    identity?: PrivateIdentity
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
    node: IronfishNode
    chain: Blockchain
    hostsStore: HostsStore
  }) {
    const identity = options.identity || new BoxKeyPair()

    this.enableSyncing = options.enableSyncing ?? true
    this.node = options.node
    this.chain = options.chain
    this.logger = (options.logger || createRootLogger()).withTag('peernetwork')
    this.metrics = options.metrics || new MetricsMonitor({ logger: this.logger })
    this.bootstrapNodes = options.bootstrapNodes || []

    this.localPeer = new LocalPeer(
      identity,
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

    this.transactionFetcher = new TransactionFetcher(this)

    this.chain.onConnectBlock.on((block) => {
      for (const transaction of block.transactions) {
        this.recentlyAddedToChain.set(transaction.hash(), true)
      }
    })

    this.chain.onDisconnectBlock.on((block) => {
      for (const transaction of block.transactions) {
        this.recentlyAddedToChain.remove(transaction.hash())
      }
    })

    this.node.miningManager.onNewBlock.on((block) => {
      const serializedBlock = BlockSerde.serialize(block)

      this.broadcastBlock(new NewBlockMessage(serializedBlock))
    })

    this.node.accounts.onBroadcastTransaction.on((transaction) => {
      const serializedTransaction = transaction.serialize()

      const nonce = Buffer.alloc(16, transaction.hash())
      const message = new NewTransactionMessage(serializedTransaction, nonce)

      this.broadcastTransaction(message)
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
          connection.send(JSON.stringify(disconnect))
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
    this.transactionFetcher.stop()
  }

  /**
   * Send a block to all connected peers who haven't yet received the block.
   */
  private broadcastBlock(message: NewBlockMessage): void {
    // TODO: This deserialization could be avoided by passing around a Block instead of a SerializedBlock
    const header = BlockHeaderSerde.deserialize(message.block.header)

    for (const peer of this.peerManager.getConnectedPeers()) {
      // Don't send the block to peers who already know about it
      if (peer.knownBlockHashes.has(header.hash)) {
        continue
      }

      if (peer.send(message)) {
        peer.knownBlockHashes.set(header.hash, KnownBlockHashesValue.Sent)
      }
    }
  }

  private broadcastTransaction(message: NewTransactionMessage): void {
    const hash = new Transaction(message.transaction).hash()
    const isUpgraded = (peer: Peer) => peer.version !== null && peer.version >= 17

    const peersToSendToArray = [...this.connectedPeersWithoutTransaction(hash)]
    const sendHash: Peer[] = []
    const sendFull: Peer[] = peersToSendToArray.filter((p) => !isUpgraded(p))

    const upgradedPeers: Peer[] = ArrayUtils.shuffle(
      peersToSendToArray.filter((p) => isUpgraded(p)),
    )

    const sqrtSize = Math.floor(Math.sqrt(peersToSendToArray.length))

    for (const peer of upgradedPeers) {
      if (sendFull.length < sqrtSize) {
        sendFull.push(peer)
      } else {
        sendHash.push(peer)
      }
    }

    const hashMessage = new NewPooledTransactionHashes([hash])

    for (const peer of sendHash) {
      if (peer.state.type !== 'CONNECTED') {
        continue
      }

      if (peer.send(hashMessage)) {
        this.markKnowsTransaction(hash, peer.state.identity)
      }
    }

    const newTransactionMessage = new NewTransactionV2Message([message.transaction])
    for (const peer of sendFull) {
      if (peer.state.type !== 'CONNECTED') {
        continue
      }

      const messageToSend = isUpgraded(peer) ? newTransactionMessage : message

      if (peer.send(messageToSend)) {
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
          resolve(message)
        },
        reject: (reason?: unknown): void => {
          clearDisconnectHandler()
          peer.pendingRPC--
          this.requests.delete(rpcId)
          clearTimeout(timeout)
          reject(reason)
        },
        peer: peer,
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

  async getBlockHashes(peer: Peer, start: number, limit: number): Promise<Buffer[]> {
    const message = new GetBlockHashesRequest(start, limit)
    const response = await this.requestFrom(peer, message)

    if (!(response.message instanceof GetBlockHashesResponse)) {
      // TODO jspafford: disconnect peer, or handle it more properly
      throw new Error(
        `Invalid GetBlockHashesResponse: ${displayNetworkMessageType(message.type)}`,
      )
    }

    return response.message.hashes
  }

  async getBlocks(peer: Peer, start: Buffer, limit: number): Promise<SerializedBlock[]> {
    const message = new GetBlocksRequest(start, limit)
    const response = await this.requestFrom(peer, message)

    if (!(response.message instanceof GetBlocksResponse)) {
      // TODO jspafford: disconnect peer, or handle it more properly
      throw new Error(`Invalid GetBlocksResponse: ${displayNetworkMessageType(message.type)}`)
    }

    // Hashes sent by the network are untrusted. Future messages should remove this field.
    for (const block of response.message.blocks) {
      block.header.hash = undefined
    }

    return response.message.blocks
  }

  private async handleMessage(
    peer: Peer,
    incomingMessage: IncomingPeerMessage<NetworkMessage>,
  ): Promise<void> {
    const { message } = incomingMessage

    if (message instanceof GossipNetworkMessage) {
      await this.handleGossipMessage(peer, message)
    } else if (message instanceof RpcNetworkMessage) {
      await this.handleRpcMessage(peer, message)
    } else if (message instanceof NewBlockHashesMessage) {
      this.handleNewBlockHashesMessage(peer, message)
    } else if (message instanceof NewBlockV2Message) {
      this.handleNewBlockV2Message(peer, message)
    } else if (message instanceof NewPooledTransactionHashes) {
      this.handleNewPooledTransactionHashes(peer, message)
    } else if (message instanceof NewTransactionV2Message) {
      for (const transaction of message.transactions) {
        // Set the nonce to the hash of the transaction for older peers
        const nonce = Buffer.alloc(16, new Transaction(transaction).hash())
        const gossipMessage = new NewTransactionMessage(transaction, nonce)
        await this.onNewTransaction(peer, gossipMessage)
      }
    } else {
      throw new Error(
        `Invalid message for handling in peer network: '${displayNetworkMessageType(
          incomingMessage.message.type,
        )}'`,
      )
    }
  }

  private async handleGossipMessage(
    peer: Peer,
    gossipMessage: GossipNetworkMessage,
  ): Promise<void> {
    if (gossipMessage instanceof NewBlockMessage) {
      await this.onNewBlock(peer, gossipMessage)
    } else if (gossipMessage instanceof NewTransactionMessage) {
      await this.onNewTransaction(peer, gossipMessage)
    } else {
      throw new Error(`Invalid gossip message type: '${gossipMessage.type}'`)
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
        for (const serializedTransaction of responseMessage.transactions) {
          const hash = new Transaction(serializedTransaction).hash()
          this.markKnowsTransaction(hash, peer.state.identity)
        }
      }
    } else {
      const request = this.requests.get(rpcId)
      if (request) {
        request.resolve({ peerIdentity, message: rpcMessage })
      }

      if (rpcMessage instanceof PooledTransactionsResponse) {
        for (const serializedTransaction of rpcMessage.transactions) {
          const nonce = Buffer.alloc(16, new Transaction(serializedTransaction).hash())
          const gossipMessage = new NewTransactionMessage(serializedTransaction, nonce)
          await this.onNewTransaction(peer, gossipMessage)
        }
      }
    }
  }

  private handleNewBlockHashesMessage(peer: Peer, message: NewBlockHashesMessage) {
    this.logger.debug(`Received unimplemented message ${message.type}`)
  }

  private handleNewBlockV2Message(peer: Peer, message: NewBlockV2Message) {
    this.logger.debug(`Received unimplemented message ${message.type}`)
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
        const nonce = Buffer.alloc(16, transaction.hash())
        const gossipMessage = new NewTransactionMessage(transaction.serialize(), nonce)
        this.broadcastTransaction(gossipMessage)
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

    const serialized = blocks.map((block) => {
      Assert.isNotNull(block)
      return BlockSerde.serialize(block)
    })

    return new GetBlocksResponse(serialized, rpcId)
  }

  private onPooledTransactionsRequest(
    message: PooledTransactionsRequest,
    rpcId: number,
  ): PooledTransactionsResponse {
    const transactions: SerializedTransaction[] = []

    for (const hash of message.transactionHashes) {
      const transaction = this.node.memPool.get(hash)
      if (transaction) {
        transactions.push(transaction.serialize())
      }
    }

    return new PooledTransactionsResponse(transactions, rpcId)
  }

  private async onGetBlockTransactionsRequest(
    peer: Peer,
    message: GetBlockTransactionsRequest,
  ): Promise<GetBlockTransactionsResponse> {
    const block = await this.chain.db.withTransaction(null, async (tx) => {
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

      transactions.push(block.transactions[currentIndex].serialize())
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

  private async onNewBlock(peer: Peer, message: NewBlockMessage): Promise<void> {
    if (!this.enableSyncing) {
      return
    }

    // Hashes sent by the network are untrusted. Future messages should remove this field.
    message.block.header.hash = undefined

    const block = message.block
    const header = BlockHeaderSerde.deserialize(message.block.header)

    peer.knownBlockHashes.set(header.hash, KnownBlockHashesValue.Received)
    for (const knownPeer of peer.knownPeers.values()) {
      knownPeer.knownBlockHashes.set(header.hash, KnownBlockHashesValue.Received)
    }

    try {
      const result = await this.node.syncer.addNewBlock(peer, block)
      if (result) {
        this.broadcastBlock(message)
      }
      return
    } catch (error) {
      this.logger.error(
        `Error when adding new block ${block.header.sequence} from ${
          peer.displayName
        }: ${ErrorUtils.renderError(error, true)}`,
      )

      return
    }
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

  private async onNewTransaction(peer: Peer, message: NewTransactionMessage): Promise<void> {
    const received = new Date()

    // Mark the peer as knowing about the transaction
    const hash = new Transaction(message.transaction).hash()
    peer.state.identity && this.markKnowsTransaction(hash, peer.state.identity)

    // Let the fetcher know that a transaction was received and we no longer have to query it
    this.transactionFetcher.receivedTransaction(hash)

    if (this.shouldProcessTransactions() && !this.alreadyHaveTransaction(hash)) {
      // Force lazy deserialization of the transaction as a first sanity check
      const transaction = this.chain.verifier.verifyNewTransaction(message.transaction)

      // Validate the transaction, so that the account and mempool do not receive
      // an invalid transaction, and we do not gossip.
      const { valid, reason } = await this.chain.verifier.verifyTransactionNoncontextual(
        transaction,
      )
      if (!valid) {
        Assert.isNotUndefined(reason)
        this.logger.debug(
          `Invalid transaction '${transaction.unsignedHash().toString('hex')}': ${reason}`,
        )
        return
      }

      // The accounts need to know about the transaction since it could be
      // relevant to the accounts, despite coming from a different node.
      await this.node.accounts.syncTransaction(transaction, {})

      if (await this.node.memPool.acceptTransaction(transaction, false)) {
        this.onTransactionAccepted.emit(transaction, received)
      }

      if (this.node.memPool.exists(transaction.hash())) {
        this.broadcastTransaction(message)
      }
    }

    this.transactionFetcher.removeTransaction(hash)
  }
}
