/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { MultiSigCoordinator, MultiSigSigner } from '../../interfaces/multiSigKeys'
import { MultiSigKeysEncoding } from './multiSigKeys'

describe('multiSigKeys encoder', () => {
  describe('with a signer value', () => {
    it('serializes the value into a buffer and deserializes to the original value', () => {
      const encoder = new MultiSigKeysEncoding()

      const value: MultiSigSigner = {
        publicKeyPackage: 'aaaaaa',
        identifier: 'aaaaaa',
        keyPackage: 'bbbb',
        proofGenerationKey: 'cccc',
      }
      const buffer = encoder.serialize(value)
      const deserializedValue = encoder.deserialize(buffer)
      expect(deserializedValue).toEqual(value)
    })
  })

  describe('with a coordinator value', () => {
    it('serializes the value into a buffer and deserializes to the original value', () => {
      const encoder = new MultiSigKeysEncoding()

      const value: MultiSigCoordinator = {
        publicKeyPackage: 'aaaa',
      }
      const buffer = encoder.serialize(value)
      const deserializedValue = encoder.deserialize(buffer)
      expect(deserializedValue).toEqual(value)
    })
  })
})
