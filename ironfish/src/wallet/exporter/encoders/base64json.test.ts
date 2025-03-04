/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import '../../../testUtilities'
import { generateKey } from '@ironfish/rust-nodejs'
import { ACCOUNT_SCHEMA_VERSION } from '../../account/account'
import { AccountImport } from '../accountImport'
import { BASE64_JSON_ACCOUNT_PREFIX, Base64JsonEncoder } from './base64json'

describe('Base64JsonEncoder', () => {
  const key = generateKey()
  const encoder = new Base64JsonEncoder()

  it(`produces a base64 blob with the ${BASE64_JSON_ACCOUNT_PREFIX} prefix`, () => {
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
    expect(encoded.startsWith(BASE64_JSON_ACCOUNT_PREFIX)).toBe(true)
    expect(encoded.slice(BASE64_JSON_ACCOUNT_PREFIX.length)).toBeBase64()
  })

  it('renames account when name is passed', () => {
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
    const decoded = encoder.decode(encoded, { name: 'foo' })
    expect(decoded.name).toBe('foo')
  })

  it('encodes the account as a base64 string and decodes the string', () => {
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
    expect(encoded.startsWith(BASE64_JSON_ACCOUNT_PREFIX)).toBe(true)

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
    expect(encoded.startsWith(BASE64_JSON_ACCOUNT_PREFIX)).toBe(true)

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
    expect(encoded.startsWith(BASE64_JSON_ACCOUNT_PREFIX)).toBe(true)

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
    expect(encoded.startsWith(BASE64_JSON_ACCOUNT_PREFIX)).toBe(true)

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
    expect(encoded.startsWith(BASE64_JSON_ACCOUNT_PREFIX)).toBe(true)

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
    expect(encoded.startsWith(BASE64_JSON_ACCOUNT_PREFIX)).toBe(true)

    const decoded = encoder.decode(encoded)
    expect(decoded).toMatchObject(accountImport)
  })

  it('throws an error when decoding strings without the prefix', () => {
    const encoded = 'not base64'

    expect(() => encoder.decode(encoded)).toThrow('Invalid prefix for base64 encoded account')
  })

  it('throws an error when decoding non-base64 strings', () => {
    const encoded = 'ifaccountnot base64'

    expect(() => encoder.decode(encoded)).toThrow('Invalid JSON')
  })
})
