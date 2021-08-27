/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * This is used to unwrap a message from an error if its possible otherwise just renders the error as JSON
 */
function extractMessage(error: unknown): string {
  if (!error) {
    return ''
  }
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return JSON.stringify(error)
}

/**
 * This is used to unwrap a message from an error
 *
 * Falls back to JSON.stringify the error if we cannot get the message
 */
export function renderError(error: unknown, stack = false): string {
  if (stack && error instanceof Error && error.stack) {
    // stack also contains the error message
    return error.stack
  }

  return extractMessage(error)
}

export function isConnectRefusedError(error: unknown): error is Error & { code: 'ECONNREFUSED'} {
  return error instanceof Error && 'code' in error && error['code'] === 'ECONNREFUSED'
}
export function isNoEntityError(error: unknown): error is Error & { code: 'ENOENT'} {
  return error instanceof Error && 'code' in error && error['code'] === 'ENOENT'
}

export const ErrorUtils = { renderError, isConnectRefusedError, isNoEntityError }
