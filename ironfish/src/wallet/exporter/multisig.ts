/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { multisig } from '@ironfish/rust-nodejs'
import {
  AccountDecodingOptions,
  MultisigIdentityEncryption,
  MultisigSecretNotFound,
} from './encoder'

export function encodeEncryptedMultisigAccount(
  value: Buffer,
  options: MultisigIdentityEncryption,
): Buffer {
  const identity = Buffer.isBuffer(options.identity)
    ? new multisig.ParticipantIdentity(options.identity)
    : options.identity

  return identity.encryptData(value)
}

export function decodeEncryptedMultisigAccount(
  value: Buffer,
  options?: AccountDecodingOptions,
): Buffer {
  if (!options?.multisigSecret) {
    throw new MultisigSecretNotFound(
      'Encrypted multisig account cannot be decrypted without a corresponding multisig secret',
    )
  }
  const secret = Buffer.isBuffer(options.multisigSecret)
    ? new multisig.ParticipantSecret(options.multisigSecret)
    : options.multisigSecret
  try {
    return secret.decryptData(value)
  } catch (e) {
    throw new Error(`Failed to decrypt multisig account: ${String(e)}`)
  }
}
