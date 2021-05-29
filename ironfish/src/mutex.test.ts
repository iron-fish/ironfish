/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Mutex } from './mutex'
import { PromiseUtils } from './utils'

describe('Mutex', () => {
  it('should lock and unlock', async () => {
    const mutex = new Mutex()

    expect(mutex.locked).toBe(false)
    expect(mutex.waiting).toBe(0)

    const unlock = await mutex.lock()

    expect(mutex.locked).toBe(true)
    expect(mutex.waiting).toBe(0)

    unlock()

    expect(mutex.locked).toBe(false)
    expect(mutex.waiting).toBe(0)
  })

  it('should lock exlusively', async () => {
    const mutex = new Mutex()
    const [promiseA, resolveA] = PromiseUtils.split<void>()
    const [promiseB, resolveB] = PromiseUtils.split<void>()
    const [promiseC, resolveC] = PromiseUtils.split<void>()

    let mutated = ''

    const test = async (key: string, wait: Promise<void>) => {
      const unlock = await mutex.lock()
      await wait
      mutated = key
      unlock()
    }

    expect(mutex.locked).toBe(false)
    expect(mutex.waiting).toBe(0)
    expect(mutated).toEqual('')

    const waitA = test('a', promiseA)

    expect(mutex.locked).toBe(true)
    expect(mutex.waiting).toBe(0)
    expect(mutated).toEqual('')

    const waitB = test('b', promiseB)

    expect(mutex.locked).toBe(true)
    expect(mutex.waiting).toBe(1)
    expect(mutated).toEqual('')

    const waitC = test('c', promiseC)

    expect(mutex.locked).toBe(true)
    expect(mutex.waiting).toBe(2)
    expect(mutated).toEqual('')

    resolveA()
    await waitA

    expect(mutex.locked).toBe(true)
    expect(mutex.waiting).toBe(1)
    expect(mutated).toEqual('a')

    resolveB()
    await waitB

    expect(mutex.locked).toBe(true)
    expect(mutex.waiting).toBe(0)
    expect(mutated).toEqual('b')

    resolveC()
    await waitC

    expect(mutex.locked).toBe(false)
    expect(mutex.waiting).toBe(0)
    expect(mutated).toEqual('c')
  })
})
