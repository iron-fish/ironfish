/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { RollingAverage } from './rollingAverage'

describe('RollingAverage', () => {
  it('Produces an expected average and variance', () => {
    const avg = new RollingAverage(2)

    avg.add(2)
    avg.add(6)
    expect(avg.average).toBe(4)
    expect(avg.variance).toBe(8)

    avg.add(4)
    expect(avg.average).toBe(5)
    expect(avg.variance).toBe(2)
  })

  it('can produce negative values', () => {
    const avg = new RollingAverage(2)

    avg.add(1)
    avg.add(-1)
    avg.add(-1)
    expect(avg.average).toBe(-1)
    expect(avg.variance).toBe(0)
  })
})
