/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Side } from '../merkletree'
import { NodeEncoding } from './nodes'

describe('NodeEncoding', () => {
  it('serializes a left node into a buffer and deserializes to the original object', () => {
    const encoding = new NodeEncoding()

    const leftNodeValue = {
      side: Side.Left,
      hashOfSibling: Buffer.alloc(32, 'hashOfSibling'),
      parentIndex: 14,
    } as const

    const buffer = encoding.serialize(leftNodeValue)
    const deserializedMessage = encoding.deserialize(buffer)
    expect(deserializedMessage).toEqual(leftNodeValue)
  })

  it('serializes a right node into a buffer and deserializes to the original object', () => {
    const encoding = new NodeEncoding()

    const rightNodeValue = {
      side: Side.Right,
      hashOfSibling: Buffer.alloc(32, 'hashOfSibling'),
      leftIndex: 14,
    } as const

    const buffer = encoding.serialize(rightNodeValue)
    const deserializedMessage = encoding.deserialize(buffer)
    expect(deserializedMessage).toEqual(rightNodeValue)
  })
})
