/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { EwmAverage } from './ewmAverage'

describe('EwmAverage', () => {
  it('A new value larger than current average increases average', () => {
    const ewma = new EwmAverage(1)

    ewma.add(4, 2)
    ewma.add(5, 2)

    const avgA = ewma.average

    ewma.add(6, 2)

    expect(ewma.average).toBeGreaterThanOrEqual(avgA)
  })

  it('A new value smaller than current average decreases average', () => {
    const ewma = new EwmAverage(1)

    ewma.add(4, 2)
    ewma.add(5, 2)

    const avgA = ewma.average

    ewma.add(2, 2)

    expect(avgA).toBeGreaterThanOrEqual(ewma.average)
  })

  it('bigger halflife equals higher weight distribution for early samples', () => {
    const ewma = new EwmAverage(1)
    const ewmaB = new EwmAverage(2)

    ewma.add(6, 1)
    ewma.add(3, 1)
    ewma.add(1, 1)

    ewmaB.add(6, 1)
    ewmaB.add(3, 1)
    ewmaB.add(1, 1)

    expect(ewmaB.average).toBeGreaterThanOrEqual(ewma.average)
  })

  it('smaller weight samples equals less weight distribution for early samples', () => {
    const ewma = new EwmAverage(1)
    const ewmaB = new EwmAverage(1)

    ewma.add(2, 20)
    ewma.add(4, 20)
    ewma.add(8, 20)

    ewmaB.add(2, 10)
    ewmaB.add(4, 10)
    ewmaB.add(8, 10)

    expect(ewma.average).toBeGreaterThanOrEqual(ewmaB.average)
  })

  it('can produce negative values', () => {
    const ewma = new EwmAverage(2)

    ewma.add(1, 2)
    ewma.add(-1, 2)
    ewma.add(-1, 2)

    expect(ewma.average).toBe(-0.7142857142857143)
  })
})
