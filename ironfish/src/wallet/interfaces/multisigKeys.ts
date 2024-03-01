/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
export interface MultisigSigner {
  secret: string
  keyPackage: string
  publicKeyPackage: string
}

export interface MultisigCoordinator {
  publicKeyPackage: string
}

export type MultisigKeys = MultisigSigner | MultisigCoordinator

// Multisig signing data can come from:
// 1. Regular account export and imported which will have the secret
// 2. Import from a trusted dealer, which will only have the identity
export type MultisigKeysImport = MultisigKeys |
  {
    identity: string
    keyPackage: string
    publicKeyPackage: string
  }
