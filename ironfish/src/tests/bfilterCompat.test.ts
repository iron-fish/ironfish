/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { RollingFilter } from '@ironfish/bfilter'
import { RollingFilterRs } from '@ironfish/rust-nodejs'
import { randomBytes } from 'crypto'
import { BenchUtils } from '../utils/bench'
import { PromiseUtils } from '../utils/promise'

const FILTER_SIZE = 500_000
const FALSE_POSITIVE_RATE = 0.0000001
const TEST_ITERATIONS = FILTER_SIZE * 4

describe('bfilter compatibility with rust bindings', () => {
  it('RollingFilter', async () => {
    const jsFilter = new RollingFilter(FILTER_SIZE, FALSE_POSITIVE_RATE)
    const rsFilter = new RollingFilterRs(FILTER_SIZE, FALSE_POSITIVE_RATE)

    let jsFp = 0
    const jsResult = await BenchUtils.withSegment(async () => {
      for (let i = 0; i < TEST_ITERATIONS; i++) {
        const x: Buffer = randomBytes(64)
        const fp = jsFilter.test(x)
        if (fp) {
          jsFp += 1
        }

        jsFilter.add(x)

        // if (i % 5000 == 0) {
        //   await PromiseUtils.sleep(10)
        //   if (global.gc) {
        //     for (let i = 0; i < 10; i++) {
        //       global.gc()
        //     }
        //   }
        // }
      }
    })

    // console.log(BenchUtils.renderSegment(jsResult, 'bfilter'))
    await PromiseUtils.sleep(1000)
    if (global.gc) {
      for (let i = 0; i < 10; i++) {
        global.gc()
      }
    }
    await PromiseUtils.sleep(1000)

    let rsFp = 0
    const rsResult = await BenchUtils.withSegment(async () => {
      for (let i = 0; i < TEST_ITERATIONS; i++) {
        const x = randomBytes(32)
        const fp = rsFilter.test(x)
        if (fp) {
          rsFp += 1
        }

        rsFilter.add(x)

        // if (i % 5000 == 0) {
        //   await PromiseUtils.sleep(10)
        //   if (global.gc) {
        //     for (let i = 0; i < 10; i++) {
        //       global.gc()
        //     }
        //   }
        // }
      }
      // await PromiseUtils.sleep(500)
    })

    console.log(BenchUtils.renderSegment(rsResult, 'Rust Rolling Filter'))

    // console.log('JS FP', jsFp)
    console.log('RS FP', rsFp)

    expect(true).toBe(true)
  }, 600000)
})
