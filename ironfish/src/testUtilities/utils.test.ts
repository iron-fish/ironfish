/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { mockImplementationShuffle } from './utils'

describe('Mocks', () => {
  it('should shuffle mock', async () => {
    const mock = jest.fn()

    const results: number[] = []

    mockImplementationShuffle<[number], void>(mock, (value: number) => {
      results.push(value)
      return Promise.resolve()
    })

    const promises = []
    for (let i = 0; i < 10; ++i) {
      promises.push(mock(i))
    }
    await Promise.all(promises)

    expect(results).toHaveLength(10)
  })

  it('should allow cancelation', () => {
    jest.useFakeTimers()

    const mock = jest.fn()
    const results: number[] = []

    function mockImplementation(value: number) {
      results.push(value)
      return Promise.resolve(value)
    }

    // it should have the result from the shuffled result
    mockImplementationShuffle(mock, mockImplementation, 1)
    mock(0)
    jest.runAllTimers()
    expect(results).toHaveLength(1)

    results.length = 0

    // when we call cancel it should not have the result
    const cancelShuffle = mockImplementationShuffle(mock, mockImplementation, 1)
    mock(0)
    cancelShuffle()
    jest.runAllTimers()
    expect(results).toHaveLength(0)
  })
})
