/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Constructor } from '../../utils/types'
import { makeResult } from './utils'

function toThrowErrorInstance<T>(
  received: () => unknown,
  errorClass: Constructor<T>,
): jest.CustomMatcherResult {
  try {
    received()

    return makeResult(
      false,
      `expected function to throw ${String(errorClass)} but did not throw`,
    )
  } catch (e: unknown) {
    if (e instanceof errorClass) {
      return makeResult(true, `expect function ${received.name} to throw ${String(errorClass)}`)
    }

    return makeResult(
      false,
      `expected function to throw ${String(errorClass)} but threw ${String(e)}`,
    )
  }
}

async function toRejectErrorInstance<T>(
  received: Promise<unknown>,
  errorClass: Constructor<T>,
): Promise<jest.CustomMatcherResult> {
  try {
    await received
    return makeResult(
      false,
      `expected function to throw ${String(errorClass)} but did not throw`,
    )
  } catch (e: unknown) {
    if (e instanceof errorClass) {
      return makeResult(true, `expect promise to reject with ${String(errorClass)}`)
    }

    return makeResult(
      false,
      `expected function to throw ${String(errorClass)} but threw ${String(e)}`,
    )
  }
}

expect.extend({
  toThrowErrorInstance,
  toRejectErrorInstance,
})

declare global {
  namespace jest {
    interface Matchers<R> {
      toThrowErrorInstance<T>(errorClass: Constructor<T>): R
      toRejectErrorInstance<T>(errorClass: Constructor<T>): Promise<R>
    }
  }
}
