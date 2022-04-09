/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createRootLogger, Logger } from '../../logger'
import { CannotSatisfyRequest } from '../messages/cannotSatisfyRequest'
import { IncomingPeerMessage, NetworkMessageType } from '../messages/networkMessage'
import { RpcNetworkMessage } from '../messages/rpcNetworkMessage'
import { NetworkError } from '../peers/connections/errors'
import { Peer } from '../peers/peer'
import { PeerManager } from '../peers/peerManager'
import { RpcId, rpcTimeoutMillis } from './rpcId'

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

type RpcRequest = {
  resolve: (value: IncomingPeerMessage<RpcNetworkMessage>) => void
  reject: (e: unknown) => void
  peer: Peer
}

/**
 * Router for sending RPC messages and waiting for a response. RPC streams
 * are quite complicated, as there are essentially two streams, one for the
 * request and one for the response.
 */
export class RpcRouter {
  peerManager: PeerManager
  private requests: Map<RpcId, RpcRequest>
  private logger: Logger
  private handlers: Map<
    NetworkMessageType,
    (message: IncomingPeerMessage<RpcNetworkMessage>) => Promise<RpcNetworkMessage>
  >

  constructor(peerManager: PeerManager, logger: Logger = createRootLogger()) {
    this.peerManager = peerManager
    this.requests = new Map<RpcId, RpcRequest>()
    this.logger = logger.withTag('rpcrouter')
    this.handlers = new Map<
      NetworkMessageType,
      (message: IncomingPeerMessage<RpcNetworkMessage>) => Promise<RpcNetworkMessage>
    >()
  }

  /**
   * Register a callback function for a given type of handler. This is the handler
   * used for incoming *requests*. Incoming responses are handled using futures
   * on the request() function.
   */
  register(
    type: NetworkMessageType,
    handler: (message: IncomingPeerMessage<RpcNetworkMessage>) => Promise<RpcNetworkMessage>,
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
    message: RpcNetworkMessage,
  ): Promise<IncomingPeerMessage<RpcNetworkMessage>> {
    const rpcId = message.rpcId

    return new Promise<IncomingPeerMessage<RpcNetworkMessage>>((resolve, reject) => {
      const timeoutMs = rpcTimeoutMillis()

      // Reject requests if the connection becomes disconnected
      const onConnectionStateChanged = () => {
        const request = this.requests.get(rpcId)

        if (request && request.peer.state.type === 'DISCONNECTED') {
          request.peer.onStateChanged.off(onConnectionStateChanged)

          const errorMessage = `Connection closed while waiting for request ${message.type}: ${rpcId}`

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
        const errorMessage = `Closing connections to ${peer.displayName} because RPC message of type ${message.type} timed out after ${timeoutMs} ms in request: ${rpcId}.`
        const error = new RequestTimeoutError(timeoutMs, errorMessage)
        this.logger.debug(errorMessage)
        clearDisconnectHandler()
        peer.close(error)
        request.reject(error)
      }, timeoutMs)

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
            `${String(peer.state.identity)} did not send ${message.type} in state ${
              peer.state.type
            }`,
          ),
        )
      }

      peer.onStateChanged.on(onConnectionStateChanged)
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
  async handle(peer: Peer, rpcMessage: RpcNetworkMessage): Promise<void> {
    const rpcId = rpcMessage.rpcId
    const peerIdentity = peer.getIdentityOrThrow()

    if (rpcMessage.direction === Direction.Request) {
      let handler
      let responseMessage: RpcNetworkMessage
      try {
        handler = this.handlers.get(rpcMessage.type)
        if (handler === undefined) {
          return
        }
        responseMessage = await handler({ peerIdentity, message: rpcMessage })
      } catch (error: unknown) {
        const asError = error as Error
        if (!(asError.name && asError.name === 'CannotSatisfyRequestError')) {
          this.logger.error(`Unexpected error in ${rpcMessage.type} handler: ${String(error)}`)
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
}
