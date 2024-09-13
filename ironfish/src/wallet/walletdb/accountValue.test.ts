/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { encrypt, generateKey, SALT_LENGTH, XNONCE_LENGTH } from '@ironfish/rust-nodejs'
import {
  AccountValueEncoding,
  DecryptedAccountValue,
  EncryptedAccountValue,
} from './accountValue'

describe('AccountValueEncoding', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const encoder = new AccountValueEncoding()

    const key = generateKey()
    const value: DecryptedAccountValue = {
      encrypted: false,
      id: 'id',
      name: 'foobar👁️🏃🐟',
      incomingViewKey: key.incomingViewKey,
      outgoingViewKey: key.outgoingViewKey,
      publicAddress: key.publicAddress,
      spendingKey: key.spendingKey,
      viewKey: key.viewKey,
      version: 1,
      createdAt: {
        hash: Buffer.alloc(32, 0),
        sequence: 1,
      },
      scanningEnabled: true,
      proofAuthorizingKey: key.proofAuthorizingKey,
    }
    const buffer = encoder.serialize(value)
    const deserializedValue = encoder.deserialize(buffer)
    expect(deserializedValue).toEqual(value)
  })

  it('serializes an object with multisigKeys into a buffer and deserializes to the original object', () => {
    const encoder = new AccountValueEncoding()

    const key = generateKey()
    const value: DecryptedAccountValue = {
      encrypted: false,
      id: 'id',
      name: 'foobar👁️🏃🐟',
      incomingViewKey: key.incomingViewKey,
      outgoingViewKey: key.outgoingViewKey,
      publicAddress: key.publicAddress,
      // NOTE: accounts with multisigKeys should not have spendingKey
      spendingKey: null,
      viewKey: key.viewKey,
      version: 1,
      createdAt: null,
      scanningEnabled: true,
      multisigKeys: {
        publicKeyPackage: 'cccc',
        secret: 'deaf',
        keyPackage: 'beef',
      },
      proofAuthorizingKey: key.proofAuthorizingKey,
    }
    const buffer = encoder.serialize(value)
    const deserializedValue = encoder.deserialize(buffer)
    expect(deserializedValue).toEqual(value)
  })

  it('serializes an object encrypted account data into a buffer and deserializes to the original object', () => {
    const encoder = new AccountValueEncoding()

    const key = generateKey()
    const value: DecryptedAccountValue = {
      encrypted: false,
      id: 'id',
      name: 'foobar👁️🏃🐟',
      incomingViewKey: key.incomingViewKey,
      outgoingViewKey: key.outgoingViewKey,
      publicAddress: key.publicAddress,
      spendingKey: null,
      viewKey: key.viewKey,
      version: 1,
      createdAt: null,
      scanningEnabled: true,
      multisigKeys: {
        publicKeyPackage: 'cccc',
        secret: 'deaf',
        keyPackage: 'beef',
      },
      proofAuthorizingKey: key.proofAuthorizingKey,
    }

    const passphrase = 'foobarbaz'
    const data = encoder.serialize(value)
    const encryptedData = encrypt(data, passphrase)

    const encryptedValue: EncryptedAccountValue = {
      encrypted: true,
      data: encryptedData,
      salt: Buffer.alloc(SALT_LENGTH),
      nonce: Buffer.alloc(XNONCE_LENGTH),
    }

    const buffer = encoder.serialize(encryptedValue)
    const deserializedValue = encoder.deserializeEncrypted(buffer)
    expect(encryptedValue).toEqual(deserializedValue)
  })
})
