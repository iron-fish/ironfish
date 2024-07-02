/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { AsyncQueue } from './asyncQueue'
import { PromiseUtils } from './promise'

describe('AsyncQueue', () => {
  it('yields items in the same order as they were added', async () => {
    const queue = new AsyncQueue<string>(32)

    await queue.push('a')
    await queue.push('b')
    await queue.push('c')

    await expect(queue.pop()).resolves.toBe('a')
    await expect(queue.pop()).resolves.toBe('b')
    await expect(queue.pop()).resolves.toBe('c')
  })

  it('reports correct length after push and pop', async () => {
    const queue = new AsyncQueue<string>(32)
    expect(queue.size).toBe(0)

    for (let size = 1; size <= 20; size++) {
      await queue.push('a')
      expect(queue.size).toBe(size)
    }

    for (let size = 19; size >= 0; size--) {
      await queue.pop()
      expect(queue.size).toBe(size)
    }
  })

  it('randomized test', async () => {
    const sequence = []
    for (let i = 0; i < 10000; i++) {
      sequence.push(i)
    }

    const queue = new AsyncQueue<number>(128)
    const pushedItems = new Array<number>()
    const poppedItems = new Array<number>()

    let i = 0
    while (poppedItems.length < sequence.length) {
      const action: 'push' | 'pop' =
        // if the queue is empty, the only possible action is 'push'
        pushedItems.length === poppedItems.length
          ? 'push'
          : // if the queue is full, the only action is 'pop'
          pushedItems.length - poppedItems.length >= 128
          ? 'pop'
          : // in all other cases, flip a coin
          Math.random() > 0.5
          ? 'push'
          : 'pop'
      if (action === 'push') {
        const item = sequence[i++]
        await queue.push(item)
        pushedItems.push(item)
      } else if (action === 'pop') {
        const item = await queue.pop()
        poppedItems.push(item)
      }
    }

    expect(pushedItems).toEqual(sequence)
    expect(poppedItems).toEqual(sequence)
  })

  describe('push', () => {
    it('blocks when the queue is full', async () => {
      const queue = new AsyncQueue<string>(2)
      await queue.push('a')
      await queue.push('b')

      // Queue is full; pushing a new element now should cause the returned
      // promise not to be resolved
      const pushPromise = queue.push('c').then(() => 'pushPromise')
      const otherPromise = new Promise((resolve) => setTimeout(resolve, 100)).then(
        () => 'otherPromise',
      )

      const [promise, res, rej] = PromiseUtils.split()
      pushPromise.then(res, rej)
      otherPromise.then(res, rej)

      const resolved = await promise
      expect(resolved).toBe('otherPromise')

      // After popping an element, the promise returned by push should resolve
      await queue.pop()
      await pushPromise
    })
  })

  describe('pop', () => {
    it('blocks when the queue is empty', async () => {
      const queue = new AsyncQueue<string>(2)

      // Queue is empty; popping an element now should cause the returned
      // promise not to be resolved
      const popPromise = queue.pop().then(() => 'popPromise')
      const otherPromise = new Promise((resolve) => setTimeout(resolve, 100)).then(
        () => 'otherPromise',
      )

      const [promise, res, rej] = PromiseUtils.split()
      popPromise.then(res, rej)
      otherPromise.then(res, rej)

      const resolved = await promise
      expect(resolved).toBe('otherPromise')

      // After pushing a new element, the promise returned by pop should
      // resolve
      await queue.push('a')
      await popPromise
    })
  })

  describe('iterator', () => {
    it('does not yield any item when empty', () => {
      const queue = new AsyncQueue<string>(5)

      expect(Array.from(queue)).toEqual([])
    })

    it('yields items without consuming them', async () => {
      const queue = new AsyncQueue<string>(5)

      await queue.push('a')
      await queue.push('b')
      await queue.push('c')

      expect(Array.from(queue)).toEqual(['a', 'b', 'c'])

      await expect(queue.pop()).resolves.toBe('a')
      await expect(queue.pop()).resolves.toBe('b')
      await expect(queue.pop()).resolves.toBe('c')
    })
  })
})
