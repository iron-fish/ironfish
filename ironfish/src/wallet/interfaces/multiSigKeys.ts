/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
export interface MultiSigSigner {
  identifier: string
  keyPackage: string
  proofGenerationKey: string
}

export interface MultiSigCoordinator {
  publicKeyPackage: string
}

export type MultiSigKeys = MultiSigSigner | MultiSigCoordinator
