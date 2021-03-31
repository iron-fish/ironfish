/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * This is only usable in the jasmine runner
 */
export function getCurrentTestPath(): string {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
  const jasmineAny = global.jasmine as any
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return jasmineAny.testPath as string
}
