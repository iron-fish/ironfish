/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  SequenceToHashesValue,
  SequenceToHashesValueEncoding,
} from '../../blockchain/database/sequenceToHashes'

describe('SequenceToHashesValueEncoding', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const encoder = new SequenceToHashesValueEncoding()

    const value: SequenceToHashesValue = {
      hashes: [Buffer.alloc(32, 0), Buffer.alloc(32, 1), Buffer.alloc(32, 2)],
    }

    const buffer = encoder.serialize(value)
    const deserializedValue = encoder.deserialize(buffer)
    expect(deserializedValue).toEqual(value)
  })
})
