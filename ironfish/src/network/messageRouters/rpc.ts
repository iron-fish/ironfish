/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createRootLogger, Logger } from '../../logger'
import { ErrorUtils } from '../../utils'
import {
  IncomingPeerMessage,
  InternalMessageType,
  isMessage,
  Message,
  MessageType,
  PayloadType,
} from '../messages'
import { Connection } from '../peers/connections/connection'
import { NetworkError } from '../peers/connections/errors'
import { Peer } from '../peers/peer'
import { PeerManager } from '../peers/peerManager'
import { nextRpcId, RpcId, rpcTimeoutMillis } from './rpcId'

export enum Direction {
  request = 'request',
  response = 'response',
}

export class CannotSatisfyRequestError extends Error {
  constructor(message: string | undefined) {
    super(message)
    this.name = 'CannotSatisfyRequestError'
  }
}

export class RequestTimeoutError extends Error {
  timeoutMs: number

  constructor(timeoutMs: number, message?: string) {
    super(message || `Request Timed Out after ${timeoutMs}ms`)
    this.name = 'RequestTimeoutError'
    this.timeoutMs = timeoutMs
  }
}

export type IncomingRpcGeneric<T extends MessageType> = IncomingPeerMessage<Rpc<T, PayloadType>>
export type IncomingRpcPeerMessage = IncomingRpcGeneric<MessageType>

/**
 * Rpc Messages essentially hold another message as its payload.
 * It adds an RpcId, and whether it is a request or a response.
 */
export type Rpc<T extends MessageType, P extends PayloadType> = Message<T, P> & {
  // Each rpc message gets an id that is unique for the requesting client
  rpcId: RpcId
  // Whether this is an outgoing request or an incoming response
  direction: Direction
}
export function isRpc(obj: unknown): obj is Rpc<MessageType, PayloadType> {
  if (!isMessage(obj)) {
    return false
  }
  const rpc = obj as Rpc<MessageType, Record<string, unknown>>

  if (rpc.type === InternalMessageType.cannotSatisfyRequest) {
    return rpc.payload === undefined
  }

  return (
    (rpc.direction === Direction.request || rpc.direction === Direction.response) &&
    typeof rpc.rpcId === 'number' &&
    rpc.payload !== null
  )
}

type RpcRequest = {
  resolve: (value: IncomingRpcPeerMessage) => void
  reject: (e: unknown) => void
  connection?: Connection
}

/**
 * Router for sending RPC messages and waiting for a response. RPC streams
 * are quite complicated, as there are essentially two streams, one for the
 * request and one for the response.
 */
export class RpcRouter {
  peerManager: PeerManager
  private handlers: Map<MessageType, (message: IncomingRpcPeerMessage) => Promise<PayloadType>>
  private requests: Map<RpcId, RpcRequest>
  private logger: Logger

  constructor(peerManager: PeerManager, logger: Logger = createRootLogger()) {
    this.peerManager = peerManager
    this.handlers = new Map<
      MessageType,
      (message: IncomingRpcPeerMessage) => Promise<PayloadType>
    >()
    this.requests = new Map<RpcId, RpcRequest>()
    this.logger = logger.withTag('rpcrouter')
  }

  /**
   * Register a callback function for a given type of handler. This is the handler
   * used for incoming *requests*. Incoming responses are handled using futures
   * on the request() function.
   */
  register<T extends MessageType>(
    type: T,
    handler: (message: IncomingRpcGeneric<T>) => Promise<PayloadType>,
  ): void
  register(
    type: MessageType,
    handler: (message: IncomingRpcPeerMessage) => Promise<PayloadType>,
  ): void {
    this.handlers.set(type, handler)
  }

  /**
   * Initiate a request for some data from a specific peer. The message is
   * packed into a Request envelope and sent to the specified peer.
   * This is an async method, so it returns a future that resolves either
   */
  requestFrom(
    peer: Peer,
    message: Message<MessageType, Record<string, unknown>>,
  ): Promise<IncomingRpcPeerMessage> {
    const rpcId = nextRpcId()
    if (typeof rpcId !== 'number') {
      throw new Error(`rpcId mocked: ${typeof rpcId}`)
    }

    return new Promise<IncomingRpcPeerMessage>((resolve, reject) => {
      const timeoutMs = rpcTimeoutMillis()

      // Reject requests if the connection becomes disconnected
      const onConnectionStateChanged = () => {
        const request = this.requests.get(rpcId)

        if (request && request?.connection?.state.type === 'DISCONNECTED') {
          request.connection.onStateChanged.off(onConnectionStateChanged)

          const errorMessage = `Connection closed while waiting for request ${
            message.type
          }: ${rpcId}${
            request.connection.error
              ? ':' + ErrorUtils.renderError(request.connection.error)
              : ''
          }`

          request.reject(new NetworkError(errorMessage))
        }
      }

      const clearDisconnectHandler = (): void => {
        this.requests.get(rpcId)?.connection?.onStateChanged.off(onConnectionStateChanged)
      }

      const timeout = setTimeout(() => {
        const request = this.requests.get(rpcId)
        if (!request) {
          throw new Error(`Timed out request ${rpcId} not found`)
        }
        const errorMessage = `Closing connections to ${peer.displayName} because RPC message of type ${message.type} timed out after ${timeoutMs} ms in request: ${rpcId}.`
        const error = new RequestTimeoutError(timeoutMs, errorMessage)
        this.logger.debug(errorMessage)
        clearDisconnectHandler()
        peer.close(error)
        request.reject(error)
      }, timeoutMs)

      const request: RpcRequest = {
        resolve: (message: IncomingRpcPeerMessage): void => {
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
      }

      peer.pendingRPC++
      this.requests.set(rpcId, request)

      const rpcMessage: Rpc<MessageType, Record<string, unknown>> = {
        type: message.type,
        rpcId,
        direction: Direction.request,
        payload: message.payload,
      }

      const connection = this.peerManager.sendTo(peer, rpcMessage)
      if (!connection) {
        return request.reject(
          new Error(
            `${String(peer.state.identity)} did not send ${message.type} in state ${
              peer.state.type
            }`,
          ),
        )
      }

      request.connection = connection
      connection.onStateChanged.on(onConnectionStateChanged)
    })
  }

  /**
   * Handle an incoming RPC message. This may be an incoming request for some
   * data, or an incoming response to one of our requests.
   *
   * If it is a request, we pass it to the handler registered for it.
   * If a response, we resolve the promise waiting for it.
   *
   * The handler for a given request should either return a payload or throw
   * a CannotFulfillRequest error
   */
  async handle(peer: Peer, rpcMessage: IncomingRpcPeerMessage['message']): Promise<void> {
    const rpcId = rpcMessage.rpcId
    const peerIdentity = peer.getIdentityOrThrow()

    if (rpcMessage.direction === Direction.request) {
      const handler = this.handlers.get(rpcMessage.type)
      if (handler === undefined) {
        return
      }

      let responseMessage: IncomingRpcPeerMessage['message']
      try {
        const response = await handler({ peerIdentity, message: rpcMessage })
        responseMessage = {
          ...rpcMessage,
          direction: Direction.response,
          payload: response,
        }
      } catch (error: unknown) {
        const asError = error as Error
        if (!(asError.name && asError.name === 'CannotSatisfyRequestError')) {
          this.logger.error(`Unexpected error in ${rpcMessage.type} handler: ${String(error)}`)
        }
        responseMessage = {
          rpcId: rpcId,
          direction: Direction.response,
          type: InternalMessageType.cannotSatisfyRequest,
        }
      }

      if (peer.state.type === 'CONNECTED') {
        this.peerManager.sendTo(peer, responseMessage)
      }
    } else {
      const request = this.requests.get(rpcId)
      if (request) {
        request.resolve({ peerIdentity, message: rpcMessage })
      }
    }
  }
}
