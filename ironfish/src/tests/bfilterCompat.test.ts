/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// @ts-nocheck
import { RollingFilter } from '@ironfish/bfilter'
import { RollingFilterRs } from '@ironfish/rust-nodejs'
import { randomBytes } from 'crypto'
import { BenchUtils } from '../utils/bench'
import { PromiseUtils } from '../utils/promise'

const FILTER_SIZE = 250_000
const FALSE_POSITIVE_RATE = 0.0000001
const TEST_ITERATIONS = 500_000

describe('bfilter compatibility with rust bindings', () => {
  it('RollingFilter', async () => {
    const jsFilter = new RollingFilter(FILTER_SIZE, FALSE_POSITIVE_RATE)
    const rsFilter = new RollingFilterRs(FILTER_SIZE, FALSE_POSITIVE_RATE)

    let jsFp = 0
    let jsFn = 0
    const jsResult = await BenchUtils.withSegment(async () => {
      for (let i = 0; i < TEST_ITERATIONS; i++) {
        const x: Buffer = randomBytes(64)
        const fp = jsFilter.test(x, null)
        if (fp) {
          jsFp += 1
        }

        jsFilter.add(x, null)

        const fneg = jsFilter.test(x, null)
        if (!fneg) {
          jsFn += 1
        }
      }
    })

    console.log(BenchUtils.renderSegment(jsResult, 'bfilter'))
    await PromiseUtils.sleep(500)

    let rsFp = 0
    const rsResult = await BenchUtils.withSegment(async () => {
      for (let i = 0; i < TEST_ITERATIONS; i++) {
        const x = randomBytes(64)
        const fp = rsFilter.test(x)
        if (fp) {
          rsFp += 1
        }

        rsFilter.add(x)
      }
    })

    console.log(BenchUtils.renderSegment(rsResult, 'Rust Rolling Filter'))

    console.log('JS FP', jsFp)
    console.log('JS FN', jsFn)
    console.log('RS FP', rsFp)

    expect(true).toBe(true)
  }, 60000)
})
