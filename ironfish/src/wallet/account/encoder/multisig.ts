/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ParticipantIdentity, ParticipantSecret } from '@ironfish/rust-nodejs'
import { AccountDecodingOptions, MultisigIdentityEncryption } from './encoder'

export function encodeEncryptedMultisigAccount(
  value: Buffer,
  options: MultisigIdentityEncryption,
): Buffer {
  const identity = Buffer.isBuffer(options.identity)
    ? new ParticipantIdentity(options.identity)
    : options.identity
  return identity.encryptData(value)
}

export function decodeEncryptedMultisigAccount(
  value: Buffer,
  options?: AccountDecodingOptions,
): Buffer {
  if (!options?.multisigSecret) {
    throw new Error('Encrypted multisig account cannot be decrypted without a multisig secret')
  }
  const secret = Buffer.isBuffer(options.multisigSecret)
    ? new ParticipantSecret(options.multisigSecret)
    : options.multisigSecret
  return secret.decryptData(value)
}
