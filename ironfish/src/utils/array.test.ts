/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ArrayUtils } from './array'

describe('ArrayUtils', () => {
  it('shuffles array', () => {
    const items: number[] = []
    for (let i = 0; i <= 10000; ++i) {
      items.push(i)
    }

    const shuffled = ArrayUtils.shuffle(items)
    expect(shuffled).not.toEqual(items)
    expect(shuffled.sort()).toEqual(items)
  })

  it('sample a random item', () => {
    let sample = ArrayUtils.sample([0, 1, 2])
    expect(sample).toBeGreaterThanOrEqual(0)
    expect(sample).toBeLessThanOrEqual(2)

    sample = ArrayUtils.sample([2])
    expect(sample).toBe(2)

    sample = ArrayUtils.sample([])
    expect(sample).toBeNull()
  })

  it('removes an item in places', () => {
    const items = [0, 1, 2]

    let removed = ArrayUtils.remove(items, 1)
    expect(removed).toBe(true)
    expect(items).toEqual([0, 2])

    removed = ArrayUtils.remove(items, 100)
    expect(removed).toBe(false)
    expect(items).toEqual([0, 2])
  })
})
