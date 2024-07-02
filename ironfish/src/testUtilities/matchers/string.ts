/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { SyncExpectationResult } from 'expect'
import { makeResult } from './utils'

function toBeBase64(self: string | null | undefined): SyncExpectationResult {
  const pass = !!self && self === Buffer.from(self, 'base64').toString('base64')

  if (!pass) {
    return makeResult(false, `expected string to be base64:\n\n${String(self)}`)
  }

  return makeResult(true, `expected string not to be base64: ${self}`)
}

expect.extend({ toBeBase64 })

declare module 'expect' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Matchers<R extends void | Promise<void>, T = unknown> {
    toBeBase64(): R
  }
}
