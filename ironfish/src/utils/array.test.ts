/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../assert'
import { ArrayUtils } from './array'

describe('ArrayUtils', () => {
  it('shuffles array', () => {
    const items: number[] = []
    for (let i = 0; i <= 10000; ++i) {
      items.push(i)
    }

    const shuffled = ArrayUtils.shuffle(items)
    expect(shuffled).not.toEqual(items)
    expect(shuffled.sort((a, b) => a - b)).toEqual(items)
  })

  it('sample a random item', () => {
    // single element
    expect(ArrayUtils.sample([2])).toBe(2)

    // empty array
    expect(ArrayUtils.sample([])).toBeNull()

    // test randomness
    const samples = [0, 1, 2]
    const found = new Set(samples)

    for (let i = 0; i < 10000; ++i) {
      const sample = ArrayUtils.sample(samples)
      Assert.isNotNull(sample)
      found.delete(sample)
    }

    expect(found.size).toBe(0)
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
