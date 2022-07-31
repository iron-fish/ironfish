/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BenchUtils } from './bench'

describe('BenchUtils', () => {
  it('should bench mark time', () => {
    const start = BenchUtils.start()
    const end = BenchUtils.end(start)

    expect(end).toBeGreaterThan(0)
  })

  it('should bench mark segment', () => {
    const start = BenchUtils.startSegment()
    const end = BenchUtils.endSegment(start)

    expect(end.time).toBeGreaterThanOrEqual(0)
    expect(end.heap === null || typeof end.heap === 'number').toBeTruthy()
    expect(end.rss === null || typeof end.rss === 'number').toBeTruthy()
    expect(end.mem === null || typeof end.mem === 'number').toBeTruthy()
  })
})
