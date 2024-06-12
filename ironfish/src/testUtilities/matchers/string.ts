/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { makeResult } from './utils'

// const isBase64 = (s: string): boolean => {
//   const s === Buffer.from(s, 'base64').toString('base64')
//   return s === rebuilt
// }

function toBeBase64(self: string | null | undefined): jest.CustomMatcherResult {
  const pass = !!self && self === Buffer.from(self, 'base64').toString('base64')

  if (!pass) {
    return makeResult(false, `expected string to be base64:\n\n${String(self)}`)
  }

  return makeResult(true, `expected string not to be base64: ${self}`)
}

expect.extend({ toBeBase64 })

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeBase64(): R
    }
  }
}
