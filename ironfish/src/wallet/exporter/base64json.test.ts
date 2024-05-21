/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { generateKey, multisig } from '@ironfish/rust-nodejs'
import { AccountImport } from '../../walletdb/accountValue'
import { ACCOUNT_SCHEMA_VERSION } from '../account'
import {
  BASE64_JSON_ACCOUNT_PREFIX,
  BASE64_JSON_MULTISIG_ENCRYPTED_ACCOUNT_PREFIX,
  Base64JsonEncoder,
} from './base64json'

const isBase64 = (s: string): boolean => {
  const rebuilt = Buffer.from(s, 'base64').toString('base64')
  return s === rebuilt
}

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
    }

    const encoded = encoder.encode(accountImport)
    expect(encoded.startsWith(BASE64_JSON_ACCOUNT_PREFIX)).toBe(true)
    expect(isBase64(encoded.slice(BASE64_JSON_ACCOUNT_PREFIX.length))).toBe(true)
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
    }

    const encoded = encoder.encode(accountImport)
    expect(encoded.startsWith(BASE64_JSON_ACCOUNT_PREFIX)).toBe(true)

    const decoded = encoder.decode(encoded)
    expect(decoded).toMatchObject(accountImport)
  })

  it('throws an error when decoding strings without the prefix', () => {
    const encoded = 'not base64'

    expect(() => encoder.decode(encoded)).toThrow()
  })

  it('throws an error when decoding non-base64 strings', () => {
    const encoded = 'ifaccountnot base64'

    expect(() => encoder.decode(encoded)).toThrow()
  })

  describe('with multisig encryption', () => {
    const multisigSecret = multisig.ParticipantSecret.random()
    const identity = multisigSecret.toIdentity()

    it(`produces a base64 blob with the ${BASE64_JSON_MULTISIG_ENCRYPTED_ACCOUNT_PREFIX} prefix`, () => {
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
      }

      const encoded = encoder.encode(accountImport, {
        encryptWith: { kind: 'MultisigIdentity', identity },
      })
      expect(encoded.startsWith(BASE64_JSON_MULTISIG_ENCRYPTED_ACCOUNT_PREFIX)).toBe(true)
      expect(
        isBase64(encoded.slice(BASE64_JSON_MULTISIG_ENCRYPTED_ACCOUNT_PREFIX.length)),
      ).toBe(true)
    })

    it('encodes an account and decodes the string', () => {
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
      }

      const encoded = encoder.encode(accountImport, {
        encryptWith: { kind: 'MultisigIdentity', identity },
      })
      expect(encoded.startsWith(BASE64_JSON_MULTISIG_ENCRYPTED_ACCOUNT_PREFIX)).toBe(true)

      const decoded = encoder.decode(encoded, { multisigSecret })
      expect(decoded).toMatchObject(accountImport)
    })

    it('throws an error when decoding without a secret', () => {
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
      }

      const encoded = encoder.encode(accountImport, {
        encryptWith: { kind: 'MultisigIdentity', identity },
      })
      expect(() => encoder.decode(encoded)).toThrow()
    })

    it('throws an error when decoding with the wrong secret', () => {
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
      }

      const encoded = encoder.encode(accountImport, {
        encryptWith: { kind: 'MultisigIdentity', identity },
      })
      const wrongSecret = multisig.ParticipantSecret.random()
      expect(() => encoder.decode(encoded, { multisigSecret: wrongSecret })).toThrow()
    })

    it('does not expose account information in cleartext', () => {
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
      }

      const encoded = encoder.encode(accountImport, {
        encryptWith: { kind: 'MultisigIdentity', identity },
      })
      expect(encoded.startsWith(BASE64_JSON_MULTISIG_ENCRYPTED_ACCOUNT_PREFIX)).toBe(true)
      expect(
        isBase64(encoded.slice(BASE64_JSON_MULTISIG_ENCRYPTED_ACCOUNT_PREFIX.length)),
      ).toBe(true)

      const binary = Buffer.from(
        encoded.slice(BASE64_JSON_MULTISIG_ENCRYPTED_ACCOUNT_PREFIX.length),
        'base64',
      )

      for (const [_key, value] of Object.entries(accountImport)) {
        if (typeof value === 'string') {
          expect(binary.includes(value)).toBe(false)
        }
      }
    })
  })
})
