/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { EwmaAverage } from './ewmaAverage'

describe('EwmaAverage', () => {
  it('Produces an expected average and variance', () => {
    const ewma = new EwmaAverage(1)

    ewma.add(2, 2)
    ewma.add(4, 2)
    ewma.add(5, 2)

    expect(ewma.average).toBe(4.666666666666667)

    ewma.add(6, 2)
    expect(ewma.average).toBe(5.670588235294118)
  })

  it('bigger halflife equals higher weight distribution for early samples', () => {
    const ewma = new EwmaAverage(1)
    const ewmaB = new EwmaAverage(2)

    ewma.add(6, 1)
    ewma.add(3, 1)
    ewma.add(1, 1)

    ewmaB.add(6, 1)
    ewmaB.add(3, 1)
    ewmaB.add(1, 1)

    expect(ewmaB.average).toBeGreaterThanOrEqual(ewma.average)
  })

  it('smaller weight samples equals less weight distribution for early samples', () => {
    const ewma = new EwmaAverage(1)
    const ewmaB = new EwmaAverage(1)

    ewma.add(2, 20)
    ewma.add(4, 20)
    ewma.add(8, 20)

    ewmaB.add(2, 10)
    ewmaB.add(4, 10)
    ewmaB.add(8, 10)

    expect(ewma.average).toBeGreaterThanOrEqual(ewmaB.average)
  })

  it('can produce negative values', () => {
    const ewma = new EwmaAverage(2)

    ewma.add(1, 2)
    ewma.add(-1, 2)
    ewma.add(-1, 2)

    expect(ewma.average).toBe(-0.7142857142857143)
  })
})
