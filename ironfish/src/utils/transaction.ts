/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert } from '../assert'

// The maximum sequence delta to minimize the amount of time a Transaction will
// wait before being valid. The assumption being made is that the MemPool is not
// very full, so a Transaction has a very high chance of being picked up. If
// this assumption changes in the future, this value should be adjusted.
const MAX_SEQUENCE_DELTA = 10
// The minimum sequence delta to minimize the chance of creating a Transaction
// that will be invalid before it gets a chance to be added to a block. The
// assumption is that it takes on average a few minutes to create the
// Transaction, broadcast it, and for it to be added to a block template by a
// miner.
const MIN_SEQUENCE_DELTA = 4

/**
 * Returns the sequence delta to use when checking which TransactionVersion to
 * use for creating a new Transaction. Optimistically chooses a version based on
 * the expiration sequence delta to give the Transaction a better chance of
 * being accepted when there is a version change happening soon.
 */
function versionSequenceDelta(expirationDelta: number): number {
  Assert.isGreaterThan(
    expirationDelta,
    -1,
    `Expected expirationDelta to be greater than or equal to 0, got ${expirationDelta}`,
  )

  // If the expirationDelta is 0, the transaction won't naturally expire, so use
  // the maximum delta
  if (expirationDelta === 0) {
    return MAX_SEQUENCE_DELTA
  }
  // If the expiration delta is smaller than the minimum sequence delta, and
  // we used the minimum sequence delta, we would create a Transaction that
  // would never be valid. Therefore, we use the given expiration delta.
  else if (expirationDelta < MIN_SEQUENCE_DELTA) {
    return expirationDelta
  }
  // Otherwise, use half of the expirationDelta, clamped between
  // MIN_SEQUENCE_DELTA and MAX_SEQUENCE_DELTA
  else {
    const halfExpDelta = Math.floor(expirationDelta / 2)
    const min = Math.max(MIN_SEQUENCE_DELTA, halfExpDelta)
    return Math.min(MAX_SEQUENCE_DELTA, min)
  }
}

export const TransactionUtils = { versionSequenceDelta }
