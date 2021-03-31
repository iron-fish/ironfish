/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Response } from '../response'

/*
 The errors in this file are to be used by RPC client implementations
 to provide a common error interface to consumers of the Ironfish RPC
 interface. Try to throw these errors when you are developing a client
 so developers can rely on these errors.
*/

/**
 * The base class for a connection related error. In case someone wants
 * to log and handle any connection related issues.
 */
export abstract class ConnectionError extends Error {}

/**
 * Thrown when the connection attempt has failed for any reason. Most
 * likely because the server is not running, the server is unreachable,
 * the server is running on a different port, etc...
 */
export class ConnectionRefusedError extends ConnectionError {}

/** Thrown when the connection is lost after you've successfully connected.
 *
 * @note In a stateless connection like HTTP this should happen after the request was sent out, but before the response has been returned.
 * @note In a stateful connection like websockets or IPC, this should be thrown any time after you've connected when the connection has been disconnected unexpectly. */
export class ConnectionLostError extends ConnectionError {}

/** Thrown when a response comes back with a code that is between 400 to 500 */
export class RequestError<TEnd = unknown, TStream = unknown> extends Error {
  response?: Response<TEnd, TStream> = undefined
  status: number
  code: string
  codeMessage: string
  codeStack: string | null

  constructor(
    response: Response<TEnd, TStream>,
    code: string,
    codeMessage: string,
    codeStack?: string,
  ) {
    super(`Request failed (${response.status}) ${code}: ${codeMessage}`)

    this.response = response
    this.status = response.status
    this.code = code
    this.codeMessage = codeMessage
    this.codeStack = codeStack || null
  }
}

/** Thrown when the request timeout has been exceeded and the request has been aborted */
export class RequestTimeoutError<TEnd, TStream> extends RequestError<TEnd, TStream> {
  constructor(response: Response<TEnd, TStream>, timeoutMs: number, route: string) {
    super(response, 'request-timeout', `Timeout of ${timeoutMs} exceeded to ${route}`)
  }
}
