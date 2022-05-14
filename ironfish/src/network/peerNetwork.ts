/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { RollingFilter } from 'bfilter'
import tweetnacl from 'tweetnacl'
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
import { SerializedBlock } from '../primitives/block'
import { BlockHeader } from '../primitives/blockheader'
import { Strategy } from '../strategy'
import { ErrorUtils } from '../utils'
import { Identity, PrivateIdentity } from './identity'
import { CannotSatisfyRequest } from './messages/cannotSatisfyRequest'
import { DisconnectingMessage, DisconnectingReason } from './messages/disconnecting'
import { GetBlockHashesRequest, GetBlockHashesResponse } from './messages/getBlockHashes'
import { GetBlocksRequest, GetBlocksResponse } from './messages/getBlocks'
import { GossipNetworkMessage } from './messages/gossipNetworkMessage'
import {
  displayNetworkMessageType,
  IncomingPeerMessage,
  NetworkMessage,
} from './messages/networkMessage'
import { NewBlockMessage } from './messages/newBlock'
import { NewTransactionMessage } from './messages/newTransaction'
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
import { BAN_SCORE, Peer } from './peers/peer'
import { PeerConnectionManager } from './peers/peerConnectionManager'
import { PeerManager } from './peers/peerManager'
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
const BAD_TRANSACTION_MAX = 100

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

  private started = false
  private readonly minPeers: number
  private readonly bootstrapNodes: string[]
  private readonly listen: boolean
  private readonly peerConnectionManager: PeerConnectionManager
  private readonly logger: Logger
  private readonly metrics: MetricsMonitor
  private readonly node: IronfishNode
  private readonly strategy: Strategy
  private readonly chain: Blockchain
  private readonly seenGossipFilter: RollingFilter
  private readonly requests: Map<RpcId, RpcRequest>
  private readonly enableSyncing: boolean
  private badMessageCounter: Map<Identity, number>

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
    this.badMessageCounter = new Map<Identity, number>()

    this.enableSyncing = options.enableSyncing ?? true
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

    this.minPeers = options.minPeers || 1
    this.listen = options.listen === undefined ? true : options.listen

    this.seenGossipFilter = new RollingFilter(GOSSIP_FILTER_SIZE, GOSSIP_FILTER_FP_RATE)
    this.requests = new Map<RpcId, RpcRequest>()

    if (options.name && options.name.length > 32) {
      options.name = options.name.slice(32)
    }

    this.node.miningManager.onNewBlock.on((block) => {
      const serializedBlock = this.strategy.blockSerde.serialize(block)

      this.gossip(new NewBlockMessage(serializedBlock))
    })

    this.node.accounts.onBroadcastTransaction.on((transaction) => {
      const serializedTransaction = this.strategy.transactionSerde.serialize(transaction)

      this.gossip(new NewTransactionMessage(serializedTransaction))
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
  }

  /**
   * Send the message to all connected peers with the expectation that they
   * will forward it to their other peers. The goal is for everyone to
   * receive the message.
   */
  private gossip(message: GossipNetworkMessage): void {
    this.seenGossipFilter.add(message.nonce)
    this.peerManager.broadcast(message)
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
    if (!this.seenGossipFilter.added(gossipMessage.nonce)) {
      return
    }

    const peerIdentity = peer.getIdentityOrThrow()

    let gossip
    if (gossipMessage instanceof NewBlockMessage) {
      gossip = await this.onNewBlock({ peerIdentity, message: gossipMessage })
    } else if (gossipMessage instanceof NewTransactionMessage) {
      gossip = await this.onNewTransaction({ peerIdentity, message: gossipMessage })
    } else {
      throw new Error(`Invalid gossip message type: '${gossipMessage.type}'`)
    }

    if (!gossip) {
      return
    }

    const peersConnections =
      this.peerManager.identifiedPeers.get(peerIdentity)?.knownPeers || new Map<string, Peer>()

    for (const activePeer of this.peerManager.getConnectedPeers()) {
      if (activePeer.state.type !== 'CONNECTED') {
        throw new Error('Peer not in state CONNECTED returned from getConnectedPeers')
      }

      // To reduce network noise, we don't send the message back to the peer that
      // sent it to us, or any of the peers connected to it
      if (
        activePeer.state.identity === peerIdentity ||
        (peersConnections.has(activePeer.state.identity) &&
          peersConnections.get(activePeer.state.identity)?.state.type === 'CONNECTED')
      ) {
        continue
      }

      activePeer.send(gossipMessage)
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

      if (peer.state.type === 'CONNECTED') {
        peer.send(responseMessage)
      }
    } else {
      const request = this.requests.get(rpcId)
      if (request) {
        request.resolve({ peerIdentity, message: rpcMessage })
      } else {
        this.logger.debug('Dropping response to unknown request', rpcId)
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
      return this.strategy.blockSerde.serialize(block)
    })

    return new GetBlocksResponse(serialized, rpcId)
  }

  private async onNewBlock(message: IncomingPeerMessage<NewBlockMessage>): Promise<boolean> {
    if (!this.enableSyncing) {
      return false
    }

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

    if (this.node.workerPool.saturated) {
      return false
    }

    const verifiedTransaction = this.chain.verifier.verifyNewTransaction(
      message.message.transaction,
    )

    const count = this.badMessageCounter.get(message.peerIdentity)
    if (await this.node.memPool.acceptTransaction(verifiedTransaction)) {
      await this.node.accounts.syncTransaction(verifiedTransaction, {})
      if (count && count > 0) {
        this.badMessageCounter.set(message.peerIdentity, count - 1)
      }
      return true
    } else {
      if (!count) {
        this.badMessageCounter.set(message.peerIdentity, 1)
      } else if (count > BAD_TRANSACTION_MAX) {
        const badPeer = this.peerManager.getPeerOrThrow(message.peerIdentity)
        this.logger.debug(
          `Disconnecting peer ${message.peerIdentity} with version ${<string>badPeer.agent}`,
        )
        this.peerManager.disconnect(
          badPeer,
          DisconnectingReason.BadMessages,
          Date.now() + 60 * 10 * 1000,
        )
      } else {
        this.badMessageCounter.set(message.peerIdentity, count + 1)
      }
      this.logger.debug(
        `Bad tx from ${message.peerIdentity}. Count is ${<number>(
          this.badMessageCounter.get(message.peerIdentity)
        )}.`,
      )
    }

    return false
  }
}
