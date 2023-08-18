/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const MAX_VERSION_DELTA = 10
const MIN_VERSION_DELTA = 3

/**
 * Returns the sequence delta to use when checking which TransactionVersion to
 * use for creating a new Transaction. Optimistically chooses a higher value to
 * give the Transaction a better chance of being accepted when there is a
 * version change happening soon.
 */
function versionSequenceDelta(expirationDelta?: number): number {
  if (expirationDelta) {
    // If the expirationDelta is less than the minimum, we must use that one
    if (expirationDelta < MIN_VERSION_DELTA) {
      return Math.max(1, expirationDelta)
    } else {
      // Otherwise, use half of the expirationDelta, clamped between
      // MIN_VERSION_DELTA and MAX_VERSION_DELTA
      const halfExpDelta = Math.floor(expirationDelta / 2)
      const min = Math.max(MIN_VERSION_DELTA, halfExpDelta)
      return Math.min(MAX_VERSION_DELTA, min)
    }
  } else {
    return MAX_VERSION_DELTA
  }
}

export const TransactionUtils = { versionSequenceDelta }
