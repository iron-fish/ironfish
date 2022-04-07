/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import tweetnacl from 'tweetnacl'
import { v4 as uuid } from 'uuid'
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
import { Block } from '../primitives'
import { SerializedBlock } from '../primitives/block'
import { BlockHeader } from '../primitives/blockheader'
import { Strategy } from '../strategy'
import { ErrorUtils } from '../utils'
import { PrivateIdentity } from './identity'
import { Identity } from './identity'
import {
  CannotSatisfyRequestError,
  FireAndForgetRouter,
  GlobalRpcRouter,
  Gossip,
  GossipRouter,
  IncomingGossipGeneric,
  IncomingRpcGeneric,
  isGossip,
  isRpc,
  Rpc,
  RpcRouter,
} from './messageRouters'
import { nextRpcId } from './messageRouters/rpcId'
import {
  IncomingPeerMessage,
  LooseMessage,
  Message,
  MessageType,
  PayloadType,
} from './messages'
import { DisconnectingMessage, DisconnectingReason } from './messages/disconnecting'
import { GetBlockHashesRequest, GetBlockHashesResponse } from './messages/getBlockHashes'
import { GetBlocksRequest, GetBlocksResponse } from './messages/getBlocks'
import { GossipNetworkMessage } from './messages/gossipNetworkMessage'
import { NetworkMessage, NetworkMessageType } from './messages/networkMessage'
import { NewBlockMessage } from './messages/newBlock'
import { NewTransactionMessage } from './messages/newTransaction'
import { RpcNetworkMessage } from './messages/rpcNetworkMessage'
import { LocalPeer } from './peers/localPeer'
import { BAN_SCORE, Peer } from './peers/peer'
import { PeerConnectionManager } from './peers/peerConnectionManager'
import { PeerManager } from './peers/peerManager'
import { IsomorphicWebSocketConstructor } from './types'
import { parseUrl } from './utils/parseUrl'
import { VERSION_PROTOCOL } from './version'
import { WebSocketServer } from './webSocketServer'

/**
 * The routing style that should be used for a message of a given type
 */
export enum RoutingStyle {
  gossip = 'gossip',
  directRPC = 'directRPC',
  globalRPC = 'globalRPC',
  fireAndForget = 'fireAndForget',
}

interface RouteMap<T extends MessageType, P extends PayloadType> {
  [RoutingStyle.gossip]: Gossip<T, P>
  [RoutingStyle.globalRPC]: Rpc<T, P>
  [RoutingStyle.directRPC]: Rpc<T, P>
  [RoutingStyle.fireAndForget]: Message<T, P>
}

interface _RouteMap {
  [RoutingStyle.gossip]: GossipNetworkMessage
  [RoutingStyle.globalRPC]: RpcNetworkMessage
  [RoutingStyle.directRPC]: RpcNetworkMessage
  [RoutingStyle.fireAndForget]: NetworkMessage
}

interface ReturnMap {
  [RoutingStyle.gossip]: Promise<boolean | void> | boolean | void
  [RoutingStyle.globalRPC]: Promise<PayloadType>
  [RoutingStyle.directRPC]: Promise<PayloadType>
  [RoutingStyle.fireAndForget]: void
}

interface _ReturnMap {
  [RoutingStyle.gossip]: Promise<boolean | void> | boolean | void
  [RoutingStyle.globalRPC]: Promise<RpcNetworkMessage>
  [RoutingStyle.directRPC]: Promise<RpcNetworkMessage>
  [RoutingStyle.fireAndForget]: void
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

  private started = false
  private readonly minPeers: number
  private readonly bootstrapNodes: string[]
  private readonly listen: boolean
  private readonly peerConnectionManager: PeerConnectionManager
  private readonly routingStyles: Map<MessageType | NetworkMessageType, RoutingStyle>
  private readonly gossipRouter: GossipRouter
  private readonly fireAndForgetRouter: FireAndForgetRouter
  private readonly directRpcRouter: RpcRouter
  private readonly globalRpcRouter: GlobalRpcRouter
  private readonly logger: Logger
  private readonly metrics: MetricsMonitor
  private readonly node: IronfishNode
  private readonly strategy: Strategy
  private readonly chain: Blockchain

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
    strategy: Strategy
    chain: Blockchain
    hostsStore: HostsStore
  }) {
    const identity = options.identity || tweetnacl.box.keyPair()
    const enableSyncing = options.enableSyncing ?? true

    this.node = options.node
    this.chain = options.chain
    this.strategy = options.strategy
    this.logger = (options.logger || createRootLogger()).withTag('peernetwork')
    this.metrics = options.metrics || new MetricsMonitor({ logger: this.logger })
    this.bootstrapNodes = options.bootstrapNodes || []

    this.localPeer = new LocalPeer(
      identity,
      options.agent || Platform.getAgent(IronfishPKG),
      VERSION_PROTOCOL,
      options.chain,
      options.node.workerPool,
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

    this.routingStyles = new Map<MessageType, RoutingStyle>()
    this.gossipRouter = new GossipRouter(this.peerManager)
    this.fireAndForgetRouter = new FireAndForgetRouter(this.peerManager)
    this.directRpcRouter = new RpcRouter(this.peerManager)
    this.globalRpcRouter = new GlobalRpcRouter(this.directRpcRouter)

    this.minPeers = options.minPeers || 1
    this.listen = options.listen === undefined ? true : options.listen

    if (options.name && options.name.length > 32) {
      options.name = options.name.slice(32)
    }

    if (enableSyncing) {
      this._registerHandler(
        NetworkMessageType.NewBlock,
        RoutingStyle.gossip,
        (p) => {
          if (!(p instanceof NewBlockMessage)) {
            throw new Error('Payload is not a serialized block')
          }

          return p
        },
        (message) => this.onNewBlock(message),
      )

      this._registerHandler(
        NetworkMessageType.NewTransaction,
        RoutingStyle.gossip,
        (p) => {
          if (!(p instanceof NewTransactionMessage)) {
            throw new Error('Payload is not a serialized transaction')
          }

          return p
        },
        (message) => this.onNewTransaction(message),
      )
    }

    this._registerHandler(
      NetworkMessageType.GetBlockHashesRequest,
      RoutingStyle.directRPC,
      (p) => {
        if (!(p instanceof GetBlockHashesRequest)) {
          throw new Error('Payload is not a valid get block hashes request')
        }
        return p
      },
      (message) => this.onGetBlockHashesRequest(message),
    )
    this.routingStyles.set(NetworkMessageType.GetBlockHashesResponse, RoutingStyle.directRPC)

    this._registerHandler(
      NetworkMessageType.GetBlocksRequest,
      RoutingStyle.directRPC,
      (m): GetBlocksRequest => {
        if (!(m instanceof GetBlocksRequest)) {
          throw new Error('Payload is not a valid get blocks request')
        }
        return m
      },
      (message) => this.onGetBlocksRequest(message),
    )
    this.routingStyles.set(NetworkMessageType.GetBlocksResponse, RoutingStyle.directRPC)

    this.node.miningManager.onNewBlock.on((block) => {
      this.gossipBlock(block)
    })

    this.node.accounts.onBroadcastTransaction.on((transaction) => {
      const serializedTransaction = this.strategy.transactionSerde.serialize(transaction)

      this.gossip(new NewTransactionMessage(serializedTransaction, uuid()))
    })
  }

  gossipBlock(block: Block): void {
    const serializedBlock = this.strategy.blockSerde.serialize(block)

    this.gossip(new NewBlockMessage(serializedBlock, uuid()))
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
  }

  /**
   * Register a handler as being the processor for a specific message type.
   * Specify the routing style to be associated with the handler so it receives
   * the right kinds of messages.
   *
   * Handlers for RPC messages can return a payload that will be sent as a reply.
   *
   * The validator function is responsible for processing the incoming message
   * and determining whether the payload is correct. It should return the
   * correctly typed payload. If the payload is incorrect, it should throw
   * an error.
   *
   * If the validator throws, the incoming message is silently dropped.
   *
   * For RPC messages, the validation handler is only called on incoming
   * requests. Incoming responses pass the message up to the application layer
   * without evaluation.
   *
   * For gossip messages, the validation handler should determine whether the
   * message is valid with respect to local state. If the validator throws,
   * the message is not gossiped out to other peers.
   */
  registerHandler<
    P extends PayloadType,
    S extends RoutingStyle = RoutingStyle,
    T extends MessageType = MessageType,
  >(
    type: T,
    style: S,
    validator: (payload: PayloadType) => Promise<P>,
    handler: (parsedMessage: IncomingPeerMessage<RouteMap<T, P>[S]>) => ReturnMap[S],
  ): void {
    const hdlr = async (msg: IncomingPeerMessage<Message<T, PayloadType>>) => {
      let resp: P
      try {
        resp = await validator('payload' in msg.message ? msg.message.payload : undefined)
      } catch {
        // Skip the handler if the message doesn't validate
        return
      }

      const newMsg = {
        ...msg,
        message: { ...msg.message, payload: resp },
      }

      return await handler(newMsg as IncomingPeerMessage<RouteMap<T, P>[S]>)
    }

    switch (style) {
      case RoutingStyle.gossip: {
        this.gossipRouter.register(
          type,
          hdlr as (
            message: IncomingGossipGeneric<T>,
          ) => Promise<boolean | void> | boolean | void,
        )
        break
      }
      case RoutingStyle.directRPC:
        this.directRpcRouter.register(
          type,
          hdlr as (message: IncomingRpcGeneric<T>) => Promise<PayloadType>,
        )
        break
      case RoutingStyle.globalRPC:
        this.globalRpcRouter.register(
          type,
          hdlr as (message: IncomingRpcGeneric<T>) => Promise<PayloadType>,
        )
        break
      case RoutingStyle.fireAndForget:
        this.fireAndForgetRouter.register(type, hdlr)
        break
    }
    this.routingStyles.set(type, style)
  }

  _registerHandler<
    S extends RoutingStyle,
    NetworkRequest extends _RouteMap[S],
    NetworkResponse extends _ReturnMap[S],
  >(
    type: NetworkMessageType,
    style: S,
    validator: (payload: NetworkMessage) => NetworkRequest,
    handler: (parsedMessage: IncomingPeerMessage<NetworkRequest>) => NetworkResponse,
  ): void {
    const hdlr = (msg: IncomingPeerMessage<NetworkMessage>): NetworkResponse => {
      return handler({
        peerIdentity: msg.peerIdentity,
        message: validator(msg.message),
      })
    }

    switch (style) {
      case RoutingStyle.gossip: {
        this.gossipRouter._register(
          type,
          hdlr as (
            message: IncomingPeerMessage<GossipNetworkMessage>,
          ) => Promise<boolean | void> | boolean | void,
        )
        break
      }
      case RoutingStyle.directRPC:
        this.directRpcRouter._register(
          type,
          hdlr as (
            message: IncomingPeerMessage<RpcNetworkMessage>,
          ) => Promise<RpcNetworkMessage>,
        )
        break
      case RoutingStyle.globalRPC:
        this.globalRpcRouter._register(
          type,
          hdlr as (
            message: IncomingPeerMessage<RpcNetworkMessage>,
          ) => Promise<RpcNetworkMessage>,
        )
        break
      case RoutingStyle.fireAndForget:
        this.fireAndForgetRouter._register(
          type,
          hdlr as (message: IncomingPeerMessage<NetworkMessage>) => void,
        )
        break
    }
    this.routingStyles.set(type, style)
  }

  /**
   * Send the message to all connected peers with the expectation that they
   * will forward it to their other peers. The goal is for everyone to
   * receive the message.
   */
  gossip(message: LooseMessage | GossipNetworkMessage): void {
    const style = this.routingStyles.get(message.type)
    if (style !== RoutingStyle.gossip) {
      throw new Error(`${message.type} type not meant to be gossipped`)
    }
    this.gossipRouter.gossip<string, PayloadType>(message)
  }

  /**
   * Send the message directly to the specified peer, if we are connected to it.
   * No response or receipt confirmation is expected.
   */
  fireAndForget(peer: Peer, message: LooseMessage): void {
    const style = this.routingStyles.get(message.type)
    if (style !== RoutingStyle.fireAndForget) {
      throw new Error(`${message.type} type not meant to be firedAndForgot`)
    }
    this.fireAndForgetRouter.fireAndForget(peer, message)
  }

  /**
   * Fire an RPC request to the given peer identity. Returns a promise that
   * will resolve when the response is received, or will be rejected if the
   * request cannot be completed before timing out.
   */
  requestFrom(
    peer: Peer,
    message: Message<MessageType, Record<string, unknown>> | RpcNetworkMessage,
  ): Promise<IncomingPeerMessage<LooseMessage> | IncomingPeerMessage<RpcNetworkMessage>> {
    const style = this.routingStyles.get(message.type)
    if (style !== RoutingStyle.directRPC) {
      throw new Error(`${message.type} type not meant to be direct RPC`)
    }
    return this.directRpcRouter.requestFrom(peer, message)
  }

  /**
   * Fire a global RPC request to a randomly chosen identity, retrying with other
   * peers if the first one fails. Returns a promise that will resolve when the
   * response is received, or throw an error if the request cannot be completed
   * before timing out.
   */
  async request(
    message: Message<MessageType, Record<string, unknown>>,
    peer?: Identity,
  ): Promise<IncomingPeerMessage<LooseMessage> | IncomingPeerMessage<RpcNetworkMessage>> {
    const style = this.routingStyles.get(message.type)

    if (style !== RoutingStyle.globalRPC) {
      throw new Error(`${message.type} type not meant to be global RPC`)
    }
    return await this.globalRpcRouter.request(message, peer)
  }

  async getBlockHashes(peer: Peer, start: Buffer | number, limit: number): Promise<Buffer[]> {
    const origin = start instanceof Buffer ? start.toString('hex') : Number(start)

    const message = new GetBlockHashesRequest(origin, limit, nextRpcId())
    const response = await this.requestFrom(peer, message)

    if (!(response.message instanceof GetBlockHashesResponse)) {
      // TODO jspafford: disconnect peer, or handle it more properly
      throw new Error(`Invalid GetBlockHashesResponse: ${message.type}`)
    }

    return response.message.blocks.map((hash) => Buffer.from(hash, 'hex'))
  }

  async getBlocks(
    peer: Peer,
    start: Buffer | bigint,
    limit: number,
  ): Promise<SerializedBlock[]> {
    const origin = start instanceof Buffer ? start.toString('hex') : Number(start)
    const message = new GetBlocksRequest(origin, limit, nextRpcId())
    const response = await this.requestFrom(peer, message)

    if (!(response.message instanceof GetBlocksResponse)) {
      // TODO jspafford: disconnect peer, or handle it more properly
      throw new Error(`Invalid GetBlocksResponse: ${message.type}`)
    }

    // Hashes sent by the network are untrusted. Future messages should remove this field.
    for (const block of response.message.blocks) {
      block.header.hash = undefined
    }

    return response.message.blocks
  }

  private async handleMessage(
    peer: Peer,
    incomingMessage: IncomingPeerMessage<LooseMessage | NetworkMessage>,
  ): Promise<void> {
    const { message } = incomingMessage
    if (message instanceof NetworkMessage) {
      if (!(message instanceof RpcNetworkMessage)) {
        throw new Error('Invalid message')
      }

      let style = this.routingStyles.get(message.type)
      if (style === undefined) {
        if (message.type === NetworkMessageType.CannotSatisfyRequest) {
          style = RoutingStyle.globalRPC
        } else {
          this.logger.warn('Received unknown message type', message.type)
          return
        }
      }

      switch (style) {
        case RoutingStyle.directRPC:
          await this.directRpcRouter.handle(peer, message)
          break
        default:
          throw new Error('Not implemented')
      }

      return
    }

    const style = this.routingStyles.get(message.type)
    if (style === undefined) {
      this.logger.warn('Received unknown message type', message.type)
      return
    }

    switch (style) {
      case RoutingStyle.gossip:
        if (!isGossip(message)) {
          this.logger.warn('Handler', message.type, 'expected gossip')
          return
        }
        await this.gossipRouter.handle(peer, message)
        break
      case RoutingStyle.directRPC:
        if (!isRpc(message)) {
          this.logger.warn('Handler', message.type, 'expected RPC')
          return
        }
        await this.directRpcRouter.handle(peer, message)
        break
      case RoutingStyle.globalRPC:
        if (!isRpc(message)) {
          this.logger.warn('Handler', message.type, 'expected (global) RPC')
          return
        }
        await this.globalRpcRouter.handle(peer, message)
        break
      case RoutingStyle.fireAndForget:
        await this.fireAndForgetRouter.handle(peer, message)
        break
    }
  }

  private updateIsReady(): void {
    const prevIsReady = this._isReady
    this._isReady = this.started && this.peerManager.getConnectedPeers().length >= this.minPeers

    if (this._isReady !== prevIsReady) {
      this.onIsReadyChanged.emit(this._isReady)
    }
  }

  private async resolveSequenceOrHash(start: string | number): Promise<BlockHeader | null> {
    if (typeof start === 'string') {
      const hash = Buffer.from(start, 'hex')
      return await this.chain.getHeader(hash)
    }

    if (typeof start === 'number') {
      const header = await this.chain.getHeaderAtSequence(start)
      if (header) {
        return header
      }
    }

    return null
  }

  private async onGetBlockHashesRequest(
    request: IncomingPeerMessage<GetBlocksRequest>,
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

    const serialized = hashes.map((h) => h.toString('hex'))
    return new GetBlockHashesResponse(serialized, rpcId)
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

    const serialized = await Promise.all(
      blocks.map((block) => {
        Assert.isNotNull(block)
        return this.strategy.blockSerde.serialize(block)
      }),
    )

    return new GetBlocksResponse(serialized, rpcId)
  }

  private async onNewBlock(message: IncomingPeerMessage<NewBlockMessage>): Promise<boolean> {
    const block = message.message.block
    const peer = this.peerManager.getPeer(message.peerIdentity)
    if (!peer) {
      return false
    }

    // Hashes sent by the network are untrusted. Future messages should remove this field.
    block.header.hash = undefined

    try {
      return await this.node.syncer.addNewBlock(peer, block)
    } catch (error) {
      this.logger.error(
        `Error when adding new block ${block.header.sequence} from ${
          peer.displayName
        }: ${ErrorUtils.renderError(error, true)}`,
      )

      return false
    }
  }

  private async onNewTransaction(
    message: IncomingPeerMessage<NewTransactionMessage>,
  ): Promise<boolean> {
    const verifiedTransaction = this.chain.verifier.verifyNewTransaction(
      message.message.transaction,
    )

    if (this.node.workerPool.saturated) {
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

    if (await this.node.memPool.acceptTransaction(verifiedTransaction)) {
      await this.node.accounts.syncTransaction(verifiedTransaction, {})
    }

    return true
  }
}
