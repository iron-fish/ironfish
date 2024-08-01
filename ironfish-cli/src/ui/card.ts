/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export function card(items: Record<string, unknown>, extraPadding: number = 2): string {
  const keys = Object.keys(items)
  const longestKey = keys.reduce((p, c) => Math.max(p, c.length), 0)

  const result = []

  for (const key of keys) {
    const keyPadded = (key + ':').padEnd(longestKey + 1 + extraPadding)
    const value = String(items[key])
    result.push(`${keyPadded} ${value}`)
  }

  return result.join('\n')
}
