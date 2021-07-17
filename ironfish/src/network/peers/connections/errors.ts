/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ErrorUtils } from '../../../utils'

export class NetworkError extends Error {
  wrappedError: unknown | null

  constructor(message?: string, wrappedError?: unknown) {
    super(ErrorUtils.renderError(message || wrappedError || 'Unknown Network Error'))
    this.wrappedError = wrappedError || null
  }
}

export class TimeoutError extends NetworkError {
  readonly timeoutMs: number

  constructor(timeoutMs: number, message?: string) {
    super(message || `Request timed out after ${timeoutMs}ms`)
    this.timeoutMs = timeoutMs
  }
}

export class HandshakeTimeoutError extends TimeoutError {
  readonly state: 'CONNECTING' | 'REQUEST_SIGNALING' | 'SIGNALING' | 'WAITING_FOR_IDENTITY'

  constructor(state: HandshakeTimeoutError['state'], timeoutMs: number, message?: string) {
    super(timeoutMs, message || `${state} timed out after ${timeoutMs}ms`)
    this.state = state
  }
}
