/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Event, waitForEmit } from './event'

describe('Event', () => {
  it('should emit', () => {
    const event = new Event<[number, boolean]>()

    let fired = false

    event.on((a, b) => {
      expect(a).toBe(5)
      expect(b).toBe(true)
      fired = true
    })

    event.emit(5, true)
    expect(fired).toBe(true)
  })

  it('should emit async', async () => {
    const event = new Event<[]>()

    let fired = false

    event.on(async (): Promise<void> => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      fired = true
    })

    await event.emitAsync()
    expect(fired).toBe(true)
  })

  it('should wait for emit', async () => {
    const foo = new Event<[number]>()
    const promise = waitForEmit(foo)
    foo.emit(5)
    expect((await promise)[0]).toBe(5)
  })

  it('should remove once', () => {
    const event = new Event<[]>()

    const mock = jest.fn()

    event.once(mock)

    event.emit()
    event.emit()
    expect(mock).toBeCalledTimes(1)
    expect(event.isEmpty).toBeTruthy()
  })
})
