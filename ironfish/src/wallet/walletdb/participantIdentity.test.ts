/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ParticipantIdentity, ParticipantIdentityEncoding } from './participantIdentity'

describe('ParticipantIdentityEncoding', () => {
  describe('with a defined value', () => {
    it('serializes the value into a buffer and deserializes to the original value', () => {
      const encoder = new ParticipantIdentityEncoding()

      const value: ParticipantIdentity = {
        identity: Buffer.alloc(129),
      }
      const buffer = encoder.serialize(value)
      const deserializedValue = encoder.deserialize(buffer)
      expect(deserializedValue).toEqual(value)
    })
  })

  describe('with a null value', () => {
    it('serializes the value into a buffer and deserializes to the original value', () => {
      const encoder = new ParticipantIdentityEncoding()

      const value = { identity: Buffer.alloc(129) }
      const buffer = encoder.serialize(value)
      const deserializedValue = encoder.deserialize(buffer)
      expect(deserializedValue).toEqual(value)
    })
  })
})
