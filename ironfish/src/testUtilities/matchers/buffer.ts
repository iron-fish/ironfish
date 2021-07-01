/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import diff from 'jest-diff'
import { makeResult } from './utils'

function toEqualBuffer(
  self: Buffer | null | undefined,
  other: Buffer | null | undefined,
): jest.CustomMatcherResult {
  const pass = self === other || (!self && !other) || (self && other && self.equals(other))

  if (!pass) {
    return makeResult(
      false,
      `expected buffers to match:\n\n${String(
        diff(self?.toString('hex'), other?.toString('hex')),
      )}`,
    )
  }

  return makeResult(
    true,
    `expected buffers not to match: ${self?.toString('hex') || String(self)}`,
  )
}

expect.extend({ toEqualBuffer: toEqualBuffer })

declare global {
  namespace jest {
    interface Matchers<R> {
      toEqualBuffer(other: Buffer | null | undefined): R
    }
  }
}
