/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { generateKey } from '@ironfish/rust-nodejs'
import { Bech32m } from '../../../utils'
import { AccountImport } from '../../walletdb/accountValue'
import { ACCOUNT_SCHEMA_VERSION } from '../account'
import { BECH32_ACCOUNT_PREFIX, Bech32AccountEncoder } from './bech32'

describe('Bech32AccountEncoder', () => {
  const key = generateKey()
  const encoder = new Bech32AccountEncoder()

  it('encodes the account as a bech32 string and decodes the string', () => {
    const accountImport: AccountImport = {
      version: ACCOUNT_SCHEMA_VERSION,
      name: 'test',
      spendingKey: key.spendingKey,
      viewKey: key.viewKey,
      incomingViewKey: key.incomingViewKey,
      outgoingViewKey: key.outgoingViewKey,
      publicAddress: key.publicAddress,
      createdAt: null,
    }

    const encoded = encoder.encode(accountImport)
    expect(encoded.startsWith(BECH32_ACCOUNT_PREFIX)).toBe(true)

    const decoded = encoder.decode(encoded)
    expect(decoded).toMatchObject(accountImport)
  })

  it('encodes and decodes accounts with non-null createdAt', () => {
    const accountImport: AccountImport = {
      version: ACCOUNT_SCHEMA_VERSION,
      name: 'test',
      spendingKey: key.spendingKey,
      viewKey: key.viewKey,
      incomingViewKey: key.incomingViewKey,
      outgoingViewKey: key.outgoingViewKey,
      publicAddress: key.publicAddress,
      createdAt: {
        hash: '0000000000000000000000000000000000000000000000000000000000000000',
        sequence: 1,
      },
    }

    const encoded = encoder.encode(accountImport)
    expect(encoded.startsWith(BECH32_ACCOUNT_PREFIX)).toBe(true)

    const decoded = encoder.decode(encoded)
    expect(decoded).toMatchObject(accountImport)
  })

  it('encodes and decodes view-only accounts', () => {
    const accountImport: AccountImport = {
      version: ACCOUNT_SCHEMA_VERSION,
      name: 'test',
      spendingKey: null,
      viewKey: key.viewKey,
      incomingViewKey: key.incomingViewKey,
      outgoingViewKey: key.outgoingViewKey,
      publicAddress: key.publicAddress,
      createdAt: null,
    }

    const encoded = encoder.encode(accountImport)
    expect(encoded.startsWith(BECH32_ACCOUNT_PREFIX)).toBe(true)

    const decoded = encoder.decode(encoded)
    expect(decoded).toMatchObject(accountImport)
  })

  it('returns null if it cannot decode the bech32 string', () => {
    const encoded = Bech32m.encode('incorrect serialization', BECH32_ACCOUNT_PREFIX)

    const decoded = encoder.decode(encoded)

    expect(decoded).toBeNull()
  })

  it('returns null when decoding non-bech32 strings', () => {
    const encoded = 'not bech32'

    const decoded = encoder.decode(encoded)

    expect(decoded).toBeNull()
  })

  it('returns null when decoding if the version does not match', () => {
    const accountImport: AccountImport = {
      version: ACCOUNT_SCHEMA_VERSION,
      name: 'test',
      spendingKey: null,
      viewKey: key.viewKey,
      incomingViewKey: key.incomingViewKey,
      outgoingViewKey: key.outgoingViewKey,
      publicAddress: key.publicAddress,
      createdAt: null,
    }

    encoder.VERSION = 0

    const encoded = encoder.encode(accountImport)
    expect(encoded.startsWith(BECH32_ACCOUNT_PREFIX)).toBe(true)

    encoder.VERSION = 1

    const decoded = encoder.decode(encoded)
    expect(decoded).toBeNull()
  })
})
