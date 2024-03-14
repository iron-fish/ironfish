/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { multisig } from '@ironfish/rust-nodejs'

export function createTrustedDealerKeyPackages(
  minSigners: number = 2,
  maxSigners: number = 2,
): multisig.TrustedDealerKeyPackages {
  const identities = Array.from({ length: maxSigners }, () =>
    multisig.ParticipantSecret.random().toIdentity().serialize().toString('hex'),
  )
  return multisig.generateAndSplitKey(minSigners, identities)
}
