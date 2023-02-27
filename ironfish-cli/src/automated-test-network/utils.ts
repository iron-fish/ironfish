/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export const second = 1000

export function sleep(ms: number): Promise<void> {
  // console.log(`sleeping...  ${ms / 1000}s`)
  return new Promise((resolve) => setTimeout(resolve, ms))
}
