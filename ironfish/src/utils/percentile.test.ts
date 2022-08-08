/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import percentile from './percentile'

describe('Percentile', () => {
  it('calculates correct percentile values', () => {
    expect(percentile([0, 5, 25, 50, 75, 100], 25)?.toString()).toEqual('5')
    expect(percentile([0, 5, 25, 50, 75, 100], 50)?.toString()).toEqual('25')
    expect(percentile([0, 5, 25, 50, 75, 100], 75)?.toString()).toEqual('75')
  })
})
