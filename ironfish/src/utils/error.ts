/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { RequestError } from '../rpc/clients/errors'

/**
 * This is used to unwrap a message from an error
 *
 * Falls back to JSON.stringify the error if we cannot get the message
 */
export function renderError(error: unknown, stack = false): string {
  if (!error) {
    return ''
  }

  if (stack) {
    if (error instanceof RequestError && error.codeStack) {
      // stack also contains the error message
      return `${error.message}\n${error.codeStack}`
    }

    if (error instanceof Error && error.stack) {
      // stack also contains the error message
      return error.stack
    }
  }

  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return JSON.stringify(error)
}

function isConnectRefusedError(error: unknown): error is Error & { code: 'ECONNREFUSED' } {
  return isNodeError(error) && error.code === 'ECONNREFUSED'
}

function isNoEntityError(error: unknown): error is Error & { code: 'NOENT' } {
  return isNodeError(error) && error.code === 'ENOENT'
}

function isNodeError(error: unknown): error is Error & { code: string } {
  return error instanceof Error && 'code' in error && typeof error['code'] === 'string'
}

export const ErrorUtils = {
  renderError,
  isConnectRefusedError,
  isNoEntityError,
  isNodeError,
}
