/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createRootLogger, Logger } from '../../logger'
import { ErrorUtils } from '../../utils'
import { IncomingPeerMessage, isMessage, Message, MessageType, PayloadType } from '../messages'
import { CannotSatisfyRequest } from '../messages/cannotSatisfyRequest'
import { RpcNetworkMessage } from '../messages/rpcNetworkMessage'
import { Connection } from '../peers/connections/connection'
import { NetworkError } from '../peers/connections/errors'
import { Peer } from '../peers/peer'
import { PeerManager } from '../peers/peerManager'
import { MessageRouter } from './messageRouter'
import { nextRpcId, RpcId, rpcTimeoutMillis } from './rpcId'

export enum Direction {
  Request = 'request',
  Response = 'response',
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

  return (
    (rpc.direction === Direction.Request || rpc.direction === Direction.Response) &&
    typeof rpc.rpcId === 'number' &&
    rpc.payload !== null
  )
}

type RpcRequest = {
  resolve: (value: IncomingRpcPeerMessage | IncomingPeerMessage<RpcNetworkMessage>) => void
  reject: (e: unknown) => void
  connection?: Connection
}

/**
 * Router for sending RPC messages and waiting for a response. RPC streams
 * are quite complicated, as there are essentially two streams, one for the
 * request and one for the response.
 */
export class RpcRouter extends MessageRouter {
  peerManager: PeerManager
  private handlers: Map<MessageType, (message: IncomingRpcPeerMessage) => Promise<PayloadType>>
  private requests: Map<RpcId, RpcRequest>
  private logger: Logger

  constructor(peerManager: PeerManager, logger: Logger = createRootLogger()) {
    super()
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
    message: Message<MessageType, Record<string, unknown>> | RpcNetworkMessage,
  ): Promise<IncomingRpcPeerMessage | IncomingPeerMessage<RpcNetworkMessage>> {
    const rpcId = nextRpcId()

    return new Promise<IncomingRpcPeerMessage | IncomingPeerMessage<RpcNetworkMessage>>(
      (resolve, reject) => {
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
          resolve: (
            message: IncomingRpcPeerMessage | IncomingPeerMessage<RpcNetworkMessage>,
          ): void => {
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

        let rpcMessage
        if (message instanceof RpcNetworkMessage) {
          rpcMessage = message
        } else {
          rpcMessage = {
            type: message.type,
            rpcId,
            direction: Direction.Request,
            payload: message.payload,
          } as Rpc<MessageType, Record<string, unknown>>
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
      },
    )
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
  async handle(
    peer: Peer,
    rpcMessage: IncomingRpcPeerMessage['message'] | RpcNetworkMessage,
  ): Promise<void> {
    const rpcId = rpcMessage.rpcId
    const peerIdentity = peer.getIdentityOrThrow()

    if (rpcMessage.direction === Direction.Request) {
      let handler
      let responseMessage: IncomingRpcPeerMessage['message'] | RpcNetworkMessage
      try {
        if (rpcMessage instanceof RpcNetworkMessage) {
          handler = this._handlers.get(rpcMessage.type)
          if (handler === undefined) {
            return
          }
          responseMessage = await handler({ peerIdentity, message: rpcMessage })
        } else {
          handler = this.handlers.get(rpcMessage.type)
          if (handler === undefined) {
            return
          }
          const response = await handler({ peerIdentity, message: rpcMessage })
          responseMessage = {
            ...rpcMessage,
            direction: Direction.Response,
            payload: response,
          }
        }
      } catch (error: unknown) {
        const asError = error as Error
        if (!(asError.name && asError.name === 'CannotSatisfyRequestError')) {
          this.logger.error(`Unexpected error in ${rpcMessage.type} handler: ${String(error)}`)
        }
        responseMessage = new CannotSatisfyRequest(rpcId)
      }

      if (peer.state.type === 'CONNECTED') {
        this.peerManager.sendTo(peer, responseMessage)
      }
    } else {
      const request = this.requests.get(rpcId)
      if (request) {
        if (rpcMessage instanceof RpcNetworkMessage) {
          request.resolve({ peerIdentity, message: rpcMessage })
        } else {
          request.resolve({ peerIdentity, message: rpcMessage })
        }
      }
    }
  }
}
