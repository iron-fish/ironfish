/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { multisig } from "..";

describe('ParticipantIdentity', () => {
  describe('ser/de', () => {
    it('serializes and deserializes as a buffer', () => {
      const secret = multisig.ParticipantSecret.random()

      const identity = secret.toIdentity()

      const serialized = identity.serialize()

      const deserialized = new multisig.ParticipantIdentity(serialized)

      expect(identity).toEqual(deserialized)
    })
  })
})
