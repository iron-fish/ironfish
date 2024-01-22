/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { FrostIdentity, FrostSecret } from "..";

describe('FrostIdentity', () => {
  describe('ser/de', () => {
    it('serializes and deserializes as a buffer', () => {
      const secret = new FrostSecret()

      const identity = secret.toIdentity()

      const serialized = identity.serialize()

      const deserialized = new FrostIdentity(serialized)

      expect(identity).toEqual(deserialized)
    })

    it('serializes and deserializes as hex', () => {
      const secret = new FrostSecret()

      const identity = secret.toIdentity()

      const identityHex = identity.toHex()

      const identityFromHex = FrostIdentity.fromHex(identityHex)

      expect(identity).toEqual(identityFromHex)
    })
  })
})