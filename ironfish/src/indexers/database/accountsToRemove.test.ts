/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { AccountsToRemoveValue, AccountsToRemoveValueEncoding } from './accountsToRemove'

describe('AccountsToRemoveValueEncoding', () => {
  describe('with an empty list', () => {
    it('serializes the object into a buffer and deserializes to the original object', () => {
      const encoder = new AccountsToRemoveValueEncoding()

      const value: AccountsToRemoveValue = {
        accounts: [],
      }

      const buffer = encoder.serialize(value)
      const deserializedValue = encoder.deserialize(buffer)
      expect(deserializedValue).toEqual(value)
    })
  })

  describe('with a list of accounts', () => {
    it('serializes the object into a buffer and deserializes to the original object', () => {
      const encoder = new AccountsToRemoveValueEncoding()

      const value: AccountsToRemoveValue = {
        accounts: ['a', 'b', 'c'],
      }

      const buffer = encoder.serialize(value)
      const deserializedValue = encoder.deserialize(buffer)
      expect(deserializedValue).toEqual(value)
    })
  })
})
