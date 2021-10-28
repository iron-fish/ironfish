/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BigIntUtils } from './bigint'

describe('BigIntUtils', () => {
  it('converts bigints to bytes and back', () => {
    const bigints = [
      BigInt(0),
      BigInt(
        '9999999999999999999999999999999999999999999999999999999999999999999999999999999999',
      ),
      BigInt(255),
      BigInt(256),
      BigInt(1024),
      BigInt(1025),
    ]

    for (const candidate of bigints) {
      const bytes = BigIntUtils.toBytes(candidate)
      const back = BigIntUtils.fromBytes(bytes)
      expect(back).toEqual(candidate)
    }
  })

  it('converts empty array to 0', () => {
    expect(BigIntUtils.fromBytes(Buffer.from([]))).toEqual(BigInt(0))
  })
})
