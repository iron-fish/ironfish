/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { xchacha20poly1305 } from '@ironfish/rust-nodejs'
import { Assert } from '../../../assert'
import { IDatabaseStore } from '../../../storage'
import { AccountDecryptionFailedError } from '../../../wallet'
import { MasterKey } from '../../../wallet/masterKey'
import {
  AccountValueEncoding as NewAccountValueEncoding,
  DecryptedAccountValue as NewDecryptedAccountValue,
} from './new/accountValue'
import {
  AccountValueEncoding as OldAccountValueEncoding,
  DecryptedAccountValue as OldDecryptedAccountValue,
  EncryptedAccountValue as OldEncryptedAccountValue,
} from './old/accountValue'
import { MasterKeyValue } from './old/masterKeyValue'

export async function getKey(
  masterKeyStore: IDatabaseStore<{ key: string; value: MasterKeyValue }>,
  salt: Buffer,
  nonce: Buffer,
  passphrase: string,
): Promise<xchacha20poly1305.XChaCha20Poly1305Key> {
  const masterKeyValue = await masterKeyStore.get('key')
  Assert.isNotUndefined(masterKeyValue)

  const masterKey = new MasterKey(masterKeyValue)

  await masterKey.unlock(passphrase)

  return masterKey.deriveKey(salt, nonce)
}

export function encryptOldAccountValue(
  decrypted: OldDecryptedAccountValue,
  key: xchacha20poly1305.XChaCha20Poly1305Key,
  salt: Buffer,
  nonce: Buffer,
): OldEncryptedAccountValue {
  // Serialize the decrypted account data using the old schema
  const encoding = new OldAccountValueEncoding()
  const serialized = encoding.serialize(decrypted)

  const encryptedData = key.encrypt(serialized)

  return {
    encrypted: true,
    salt,
    nonce,
    data: encryptedData,
  }
}

// Decrypts encrypted account data and deserializes it using the OLD version of
// the DecryptedAccountValue schema
export function decryptOldEncryptedAccountValue(
  encrypted: Buffer,
  key: xchacha20poly1305.XChaCha20Poly1305Key,
): OldDecryptedAccountValue {
  try {
    const decrypted = key.decrypt(encrypted)

    // Deserialize the decrypted account data using the old schema
    const encoding = new OldAccountValueEncoding()
    return encoding.deserializeDecrypted(decrypted)
  } catch {
    throw new AccountDecryptionFailedError()
  }
}

// Decrypts encrypted account data and deserializes it using the NEW version of
// the DecryptedAccountValue schema
export function decryptNewEncryptedAccountValue(
  encrypted: Buffer,
  key: xchacha20poly1305.XChaCha20Poly1305Key,
): NewDecryptedAccountValue {
  try {
    const decrypted = key.decrypt(encrypted)

    // Deserialize the decrypted account data using the new schema
    const encoding = new NewAccountValueEncoding()
    return encoding.deserializeDecrypted(decrypted)
  } catch {
    throw new AccountDecryptionFailedError()
  }
}
