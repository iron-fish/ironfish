/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { AssetsValue, AssetsValueEncoding } from './assets'

describe('AssetsValueEncoding', () => {
  it('serializes the value into a buffer and deserializes to the original value', () => {
    const encoder = new AssetsValueEncoding()

    const value: AssetsValue = {
      createdTransactionHash: Buffer.alloc(32, 0),
      metadata: 'foobar👁️🏃🐟',
      name: 'test-coin',
      nonce: 0,
      owner: '8a4685307f159e95418a0dd3d38a3245f488c1baf64bc914f53486efd370c563',
      supply: BigInt(100),
    }
    const buffer = encoder.serialize(value)
    const deserializedValue = encoder.deserialize(buffer)
    expect(deserializedValue).toEqual(value)
  })
})
