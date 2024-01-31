/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { generateKey } from '@ironfish/rust-nodejs'
import { Bech32m } from '../../../utils'
import { AccountImport } from '../../walletdb/accountValue'
import { ACCOUNT_SCHEMA_VERSION } from '../account'
import { BECH32_ACCOUNT_PREFIX, Bech32Encoder } from './bech32'

describe('Bech32AccountEncoder', () => {
  const key = generateKey()
  const encoder = new Bech32Encoder()

  it('encodes the account as a bech32 string and decodes the string', () => {
    const accountImport: AccountImport = {
      version: ACCOUNT_SCHEMA_VERSION,
      name: 'test',
      proofAuthorizingKey: key.proofAuthorizingKey,
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
      proofAuthorizingKey: key.proofAuthorizingKey,
      viewKey: key.viewKey,
      incomingViewKey: key.incomingViewKey,
      outgoingViewKey: key.outgoingViewKey,
      publicAddress: key.publicAddress,
      createdAt: {
        hash: Buffer.from(
          '0000000000000000000000000000000000000000000000000000000000000000',
          'hex',
        ),
        sequence: 1,
      },
    }

    const encoded = encoder.encode(accountImport)
    expect(encoded.startsWith(BECH32_ACCOUNT_PREFIX)).toBe(true)

    const decoded = encoder.decode(encoded)
    expect(decoded).toMatchObject(accountImport)
  })

  it('encodes and decodes accounts with multisig keys', () => {
    const accountImport: AccountImport = {
      version: ACCOUNT_SCHEMA_VERSION,
      name: 'test',
      spendingKey: null,
      proofAuthorizingKey: key.proofAuthorizingKey,
      viewKey: key.viewKey,
      incomingViewKey: key.incomingViewKey,
      outgoingViewKey: key.outgoingViewKey,
      publicAddress: key.publicAddress,
      createdAt: null,
      multiSigKeys: {
        identifier: 'aaaa',
        keyPackage: 'bbbb',
        proofGenerationKey: 'cccc',
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
      proofAuthorizingKey: key.proofAuthorizingKey,
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

  it('throws an error if it cannot decode the bech32 string', () => {
    const encoded = Bech32m.encode('incorrect serialization', BECH32_ACCOUNT_PREFIX)

    expect(() => encoder.decode(encoded)).toThrow()
  })

  it('throws an error when decoding non-bech32 strings', () => {
    const encoded = 'not bech32'

    expect(() => encoder.decode(encoded)).toThrow()
  })

  it('throws an error when decoding if the version is not supported', () => {
    const accountImport: AccountImport = {
      version: ACCOUNT_SCHEMA_VERSION,
      name: 'test',
      spendingKey: null,
      viewKey: key.viewKey,
      proofAuthorizingKey: key.proofAuthorizingKey,
      incomingViewKey: key.incomingViewKey,
      outgoingViewKey: key.outgoingViewKey,
      publicAddress: key.publicAddress,
      createdAt: null,
    }

    encoder.VERSION = 0

    const encoded = encoder.encode(accountImport)
    expect(encoded.startsWith(BECH32_ACCOUNT_PREFIX)).toBe(true)

    expect(() => encoder.decode(encoded)).toThrow()
  })
})
