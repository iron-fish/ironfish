/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export interface MultisigSigner {
  secret: string
  identity: string
  keyPackage: string
  publicKeyPackage: string
}

export interface MultisigHardwareSigner {
  identity: string
  publicKeyPackage: string
}

export interface MultisigCoordinator {
  publicKeyPackage: string
}

export type MultisigKeys = MultisigSigner | MultisigHardwareSigner | MultisigCoordinator
