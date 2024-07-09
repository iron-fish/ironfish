/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { AsyncUtils } from './async'

describe('AsyncUtils', () => {
  it('filters items', async () => {
    const items = new Map([
      [1, true],
      [2, false],
      [3, true],
      [4, false],
    ])

    const keys = Array.from(items.keys())

    const results = await AsyncUtils.filter(keys, (n) => Promise.resolve(!!items.get(n)))

    expect(results).toHaveLength(2)
    expect(results[0]).toBe(1)
    expect(results[1]).toBe(3)
  })

  it('rejects items', async () => {
    const items = new Map([
      [1, true],
      [2, false],
      [3, true],
      [4, false],
    ])

    const keys = Array.from(items.keys())

    const results = await AsyncUtils.reject(keys, (n) => Promise.resolve(!!items.get(n)))

    expect(results).toHaveLength(2)
    expect(results[0]).toBe(2)
    expect(results[1]).toBe(4)
  })
})
