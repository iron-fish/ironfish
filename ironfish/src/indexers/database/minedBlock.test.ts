/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { MinedBlockValue, MinedBlockValueEncoding } from './minedBlock'

describe('MinedBlockValueEncoding', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const encoder = new MinedBlockValueEncoding()

    const value: MinedBlockValue = {
      main: true,
      sequence: 123,
      account: 'foobar',
      minersFee: 20,
    }

    const buffer = encoder.serialize(value)
    const deserializedValue = encoder.deserialize(buffer)
    expect(deserializedValue).toEqual(value)
  })
})
