/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { LeafEncoding } from './leaves'

describe('LeafEncoding', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const encoding = new LeafEncoding()
    const leafValue = {
      merkleHash: Buffer.alloc(32, 'hashOfSibling'),
      parentIndex: 14,
    } as const

    const buffer = encoding.serialize(leafValue)
    const deserializedMessage = encoding.deserialize(buffer)
    expect(deserializedMessage).toEqual(leafValue)
  })
})
