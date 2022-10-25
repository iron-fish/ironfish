/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { FixedNumberUtils } from './fixedNumber'

describe('FixedNumberUtils', () => {
  it('render', () => {
    expect(FixedNumberUtils.render(1n, 0)).toEqual('1')
    expect(FixedNumberUtils.render(1n, 2)).toEqual('1.00')
    expect(FixedNumberUtils.render(1n, 8)).toEqual('1.00000000')
  })
})
