/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { generateKey } from '@ironfish/rust-nodejs'
import { Bech32m } from '../../../utils'
import { ACCOUNT_SCHEMA_VERSION } from '../../account/account'
import { AccountImport } from '../accountImport'
import { BECH32_ACCOUNT_PREFIX, Bech32Encoder } from './bech32'

describe('Bech32AccountEncoder', () => {
  const key = generateKey()
  const encoder = new Bech32Encoder()

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
      proofAuthorizingKey: key.proofAuthorizingKey,
      ledger: false,
    }

    const encoded = encoder.encode(accountImport)
    expect(encoded.startsWith(BECH32_ACCOUNT_PREFIX)).toBe(true)

    const decoded = encoder.decode(encoded)
    expect(decoded).toMatchObject(accountImport)
  })

  it('renames account when name is passed', () => {
    const encoded = encoder.encode({
      version: ACCOUNT_SCHEMA_VERSION,
      name: 'test',
      spendingKey: key.spendingKey,
      viewKey: key.viewKey,
      incomingViewKey: key.incomingViewKey,
      outgoingViewKey: key.outgoingViewKey,
      publicAddress: key.publicAddress,
      createdAt: null,
      proofAuthorizingKey: key.proofAuthorizingKey,
      ledger: false,
    })

    const decoded = encoder.decode(encoded, { name: 'foo' })
    expect(decoded.name).toEqual('foo')
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
        hash: Buffer.from(
          '0000000000000000000000000000000000000000000000000000000000000000',
          'hex',
        ),
        sequence: 1,
      },
      proofAuthorizingKey: key.proofAuthorizingKey,
      ledger: false,
    }

    const encoded = encoder.encode(accountImport)
    expect(encoded.startsWith(BECH32_ACCOUNT_PREFIX)).toBe(true)

    const decoded = encoder.decode(encoded)
    expect(decoded).toMatchObject(accountImport)
  })

  it('encodes and decodes accounts with proofAuthorizingKey', () => {
    const accountImport: AccountImport = {
      version: ACCOUNT_SCHEMA_VERSION,
      name: 'test',
      spendingKey: null,
      viewKey: key.viewKey,
      incomingViewKey: key.incomingViewKey,
      outgoingViewKey: key.outgoingViewKey,
      publicAddress: key.publicAddress,
      createdAt: null,
      proofAuthorizingKey: key.proofAuthorizingKey,
      ledger: false,
    }

    const encoded = encoder.encode(accountImport)
    expect(encoded.startsWith(BECH32_ACCOUNT_PREFIX)).toBe(true)

    const decoded = encoder.decode(encoded)
    expect(decoded).toMatchObject(accountImport)
  })

  it('encodes and decodes accounts with multisig coordinator keys', () => {
    const accountImport: AccountImport = {
      version: ACCOUNT_SCHEMA_VERSION,
      name: 'test',
      spendingKey: null,
      viewKey: key.viewKey,
      incomingViewKey: key.incomingViewKey,
      outgoingViewKey: key.outgoingViewKey,
      publicAddress: key.publicAddress,
      createdAt: null,
      multisigKeys: {
        publicKeyPackage: 'abcdef0000',
      },
      proofAuthorizingKey: key.proofAuthorizingKey,
      ledger: false,
    }

    const encoded = encoder.encode(accountImport)
    expect(encoded.startsWith(BECH32_ACCOUNT_PREFIX)).toBe(true)

    const decoded = encoder.decode(encoded)
    expect(decoded).toMatchObject(accountImport)
  })

  it('encodes and decodes accounts with multisig signer keys', () => {
    const accountImport: AccountImport = {
      version: ACCOUNT_SCHEMA_VERSION,
      name: 'test',
      spendingKey: null,
      viewKey: key.viewKey,
      incomingViewKey: key.incomingViewKey,
      outgoingViewKey: key.outgoingViewKey,
      publicAddress: key.publicAddress,
      createdAt: null,
      multisigKeys: {
        publicKeyPackage: 'cccc',
        secret: 'aaaa',
        keyPackage: 'bbbb',
      },
      proofAuthorizingKey: null,
      ledger: false,
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
      proofAuthorizingKey: null,
      ledger: true,
    }

    const encoded = encoder.encode(accountImport)
    expect(encoded.startsWith(BECH32_ACCOUNT_PREFIX)).toBe(true)

    const decoded = encoder.decode(encoded)
    expect(decoded).toMatchObject(accountImport)
  })

  it('throws an error if it cannot decode the bech32 string', () => {
    const encoded = Bech32m.encode('incorrect serialization', BECH32_ACCOUNT_PREFIX)

    expect(() => encoder.decode(encoded)).toThrow(
      'Bufio decoding failed while using bech32 encoder',
    )
  })

  it('throws an error when decoding non-bech32 strings', () => {
    const encoded = 'not bech32'

    expect(() => encoder.decode(encoded)).toThrow('Could not decode account')
  })

  it('throws an error when decoding if the version is not supported', () => {
    const accountImport: AccountImport = {
      version: ACCOUNT_SCHEMA_VERSION,
      name: 'test',
      spendingKey: null,
      viewKey: key.viewKey,
      incomingViewKey: key.incomingViewKey,
      outgoingViewKey: key.outgoingViewKey,
      publicAddress: key.publicAddress,
      createdAt: null,
      proofAuthorizingKey: key.proofAuthorizingKey,
      ledger: false,
    }

    encoder.VERSION = 0

    const encoded = encoder.encode(accountImport)
    expect(encoded.startsWith(BECH32_ACCOUNT_PREFIX)).toBe(true)

    expect(() => encoder.decode(encoded)).toThrow('Encoded account version 0 not supported')
  })
})
