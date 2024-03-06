/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  generateAndSplitKey,
  ParticipantSecret,
  TrustedDealerKeyPackages,
} from '@ironfish/rust-nodejs'

export function createTrustedDealerKeyPackages(
  minSigners: number = 2,
  maxSigners: number = 2,
): TrustedDealerKeyPackages {
  const identities = Array.from({ length: maxSigners }, () =>
    ParticipantSecret.random().toIdentity().serialize().toString('hex'),
  )
  return generateAndSplitKey(minSigners, identities)
}