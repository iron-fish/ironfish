/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { MathUtils } from './math'

describe('MathUtils', () => {
  it('floor', () => {
    expect(MathUtils.floor(999, 0).toString()).toEqual('999')
    expect(MathUtils.floor(999, 2).toString()).toEqual('999')
    expect(MathUtils.floor(999.999, 0).toString()).toEqual('999')
    expect(MathUtils.floor(999.999, 1).toString()).toEqual('999.9')
    expect(MathUtils.floor(999.999, 2).toString()).toEqual('999.99')
  })
})
