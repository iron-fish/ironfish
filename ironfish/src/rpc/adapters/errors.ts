/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** All the known error codes for APIs that can be sent back from all APIs */
export enum ERROR_CODES {
  ACCOUNT_EXISTS = 'account-exists',
  ERROR = 'error',
  ROUTE_NOT_FOUND = 'route-not-found',
  VALIDATION = 'validation',
  INSUFFICIENT_BALANCE = 'insufficient-balance',
}

/**
 * Thrown by any part of the RPC server side networking stack to
 * indicate that the request should be ended and an error should be
 * sent back to the client. Any implementer of {@link IAdapter} should
 * catch this before feeding the {@link Request} into the {@link Router},
 * handle it, and render a response to the requester appropriately.
 *
 * @note Look at the {@link IPCAdapter} implementation for an example
 */
export class ResponseError extends Error {
  status: number
  code: string
  error: Error | null = null

  constructor(message: string, code?: string, status?: number)
  constructor(error: Error, code?: string, status?: number)
  constructor(messageOrError: string | Error, code = ERROR_CODES.ERROR, status = 400) {
    super(messageOrError instanceof Error ? messageOrError.message : messageOrError)

    if (messageOrError instanceof Error) {
      this.error = messageOrError
      this.stack = this.error.stack
    }

    this.status = status
    this.code = code
  }
}

/**
 * A convenience error to throw inside of routes when you want to indicate
 * a 400 error to the user based on validation
 */
export class ValidationError extends ResponseError {
  constructor(message: string, status = 400, code = ERROR_CODES.VALIDATION) {
    super(message, code, status)
  }
}
