/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { generateKey, multisig } from '@ironfish/rust-nodejs'
import { createNodeTest } from '../../testUtilities'
import { ACCOUNT_SCHEMA_VERSION } from '../account/account'
import { AccountImport } from './accountImport'
import { JsonEncoder } from './encoders/json'
import {
  BASE64_JSON_MULTISIG_ENCRYPTED_ACCOUNT_PREFIX,
  decryptEncodedAccount,
  decryptEncodedAccountWithMultisigSecret,
  encryptEncodedAccount,
} from './encryption'

describe('Wallet Export Encryption', () => {
  const nodeTest = createNodeTest()
  const key = generateKey()

  const account: AccountImport = {
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

  const secret = multisig.ParticipantSecret.random()
  const identity = secret.toIdentity()

  it('encodes an account and decodes the string', () => {
    const encoded = new JsonEncoder().encode(account)
    const encrypted = encryptEncodedAccount(encoded, {
      kind: 'MultisigIdentity',
      identity: identity,
    })

    const decrypted = decryptEncodedAccountWithMultisigSecret(encrypted, secret)
    expect(decrypted).toEqual(encoded)
  })

  it('returns null when decoding with the wrong secret', () => {
    const wrongSecret = multisig.ParticipantSecret.random()

    const encoded = new JsonEncoder().encode(account)
    const encrypted = encryptEncodedAccount(encoded, {
      kind: 'MultisigIdentity',
      identity: identity,
    })

    const decrypted = decryptEncodedAccountWithMultisigSecret(encrypted, wrongSecret)
    expect(decrypted).toBeNull()
  })

  it('does not expose account information in cleartext', () => {
    const encoded = new JsonEncoder().encode(account)
    const encrypted = encryptEncodedAccount(encoded, {
      kind: 'MultisigIdentity',
      identity: identity,
    })

    for (const value of Object.values(account)) {
      if (typeof value === 'string') {
        expect(encrypted.includes(value)).toBe(false)
      }
    }
  })

  it('encodes in base64 with prefix', () => {
    const encoded = new JsonEncoder().encode(account)
    const encrypted = encryptEncodedAccount(encoded, {
      kind: 'MultisigIdentity',
      identity: identity,
    })

    expect(encrypted.startsWith(BASE64_JSON_MULTISIG_ENCRYPTED_ACCOUNT_PREFIX)).toBe(true)
    expect(encrypted.slice(BASE64_JSON_MULTISIG_ENCRYPTED_ACCOUNT_PREFIX.length)).toBeBase64()
  })

  it('should decrypt an account using wallet secrets', async () => {
    const identity = await nodeTest.wallet.createMultisigSecret('foo')

    const encoded = new JsonEncoder().encode(account)

    const encrypted = encryptEncodedAccount(encoded, {
      kind: 'MultisigIdentity',
      identity: new multisig.ParticipantIdentity(identity),
    })

    const decrypted = await decryptEncodedAccount(encrypted, nodeTest.wallet)
    expect(decrypted).toEqual(encoded)
  })
})
