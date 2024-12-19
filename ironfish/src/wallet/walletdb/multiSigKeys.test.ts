/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  MultisigCoordinator,
  MultisigHardwareSigner,
  MultisigSigner,
} from '../interfaces/multisigKeys'
import { MultisigKeysEncoding } from './multisigKeys'

describe('multisigKeys encoder', () => {
  describe('with a signer value', () => {
    it('serializes the value into a buffer and deserializes to the original value', () => {
      const encoder = new MultisigKeysEncoding()

      const value: MultisigSigner = {
        publicKeyPackage: 'aaaaaa',
        secret: 'aaaaaa',
        keyPackage: 'bbbb',
        identity: 'cccc',
      }
      const buffer = encoder.serialize(value)
      const deserializedValue = encoder.deserialize(buffer)
      expect(deserializedValue).toEqual(value)
    })
  })

  describe('with a coordinator value', () => {
    it('serializes the value into a buffer and deserializes to the original value', () => {
      const encoder = new MultisigKeysEncoding()

      const value: MultisigCoordinator = {
        publicKeyPackage: 'aaaa',
      }
      const buffer = encoder.serialize(value)
      const deserializedValue = encoder.deserialize(buffer)
      expect(deserializedValue).toEqual(value)
    })
  })

  describe('with a hardware multisig', () => {
    it('serializes the value into a buffer and deserialized to the original value', () => {
      const encoder = new MultisigKeysEncoding()

      const value: MultisigHardwareSigner = {
        publicKeyPackage: 'aaaa',
        identity: 'c0ffee',
      }
      const buffer = encoder.serialize(value)
      const deserializedValue = encoder.deserialize(buffer)
      expect(deserializedValue).toEqual(value)
    })
  })
})
