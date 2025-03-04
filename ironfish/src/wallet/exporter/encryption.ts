/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { multisig } from '@ironfish/rust-nodejs'
import { Wallet } from '../wallet'

interface MultisigIdentityEncryption {
  kind: 'MultisigIdentity'
  identity: multisig.ParticipantIdentity
}

// This is meant to be a tagged union type: `AccountEncryptionMethod = Method1 | Method2 | Method3 | ...`
export type AccountEncryptionMethod = MultisigIdentityEncryption

function isMultisigIdentityEncryption(
  method: AccountEncryptionMethod,
): method is MultisigIdentityEncryption {
  return 'kind' in method && method.kind === 'MultisigIdentity'
}

export const BASE64_JSON_MULTISIG_ENCRYPTED_ACCOUNT_PREFIX = 'ifmsaccount'

/**
 * This returns the decrypted account if decryption was successful
 * or returns the original unencrypted input if encryption was not
 * successful
 */
export async function decryptEncodedAccount(
  encrypted: string,
  wallet: Wallet,
): Promise<string> {
  // Try multisig secrets in the wallet
  if (encrypted.startsWith(BASE64_JSON_MULTISIG_ENCRYPTED_ACCOUNT_PREFIX)) {
    const encoded = encrypted.slice(BASE64_JSON_MULTISIG_ENCRYPTED_ACCOUNT_PREFIX.length)

    for await (const { secret: secretBuffer } of wallet.walletDb.getMultisigIdentities()) {
      if (secretBuffer === undefined) {
        continue
      }

      const secret = new multisig.ParticipantSecret(secretBuffer)
      const decrypted = decryptEncodedAccountWithMultisigSecret(encoded, secret)
      if (decrypted) {
        return decrypted
      }
    }
  }

  return encrypted
}

export function decryptEncodedAccountWithMultisigSecret(
  encrypted: string,
  secret: multisig.ParticipantSecret,
): string | null {
  if (encrypted.startsWith(BASE64_JSON_MULTISIG_ENCRYPTED_ACCOUNT_PREFIX)) {
    encrypted = encrypted.slice(BASE64_JSON_MULTISIG_ENCRYPTED_ACCOUNT_PREFIX.length)
  }

  const encoded = Buffer.from(encrypted, 'base64')

  try {
    return secret.decryptData(encoded).toString('utf8')
  } catch (e: unknown) {
    try {
      return secret.decryptLegacyData(encoded).toString('utf8')
    } catch (e: unknown) {
      return null
    }
  }
}

/**
 * This will encrypt and encode the account with the given encryption scheme
 */
export function encryptEncodedAccount(
  encoded: string,
  encryption: AccountEncryptionMethod,
): string {
  if (isMultisigIdentityEncryption(encryption)) {
    const binary = Buffer.from(encoded)
    const encrypted = encryption.identity.encryptData(binary)
    const base64 = encrypted.toString('base64')
    return BASE64_JSON_MULTISIG_ENCRYPTED_ACCOUNT_PREFIX + base64
  }

  throw new Error('Unknown encryption method requested')
}
