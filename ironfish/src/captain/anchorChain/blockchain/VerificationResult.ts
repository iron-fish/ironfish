/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BlockHash } from './BlockHeader'

/**
 * Indicator of whether or not an entity is valid. Note that No maps to zero,
 * so a truthy test will work, but beware of Unknown responses
 */
export enum Validity {
  No,
  Yes,
  Unknown,
}

export enum VerificationResultReason {
  BLOCK_TOO_OLD = 'Block timestamp is in past',
  ERROR = 'error',
  HASH_NOT_MEET_TARGET = 'hash does not meet target',
  INVALID_MINERS_FEE = "Miner's fee is incorrect",
  INVALID_TARGET = 'Invalid target',
  INVALID_TRANSACTION_PROOF = 'invalid transaction proof',
  NOTE_COMMITMENT_SIZE = 'Note commitment sizes do not match',
  NULLIFIER_COMMITMENT_SIZE = 'Nullifier commitment sizes do not match',
  SEQUENCE_OUT_OF_ORDER = 'Block sequence is out of order',
  TOO_FAR_IN_FUTURE = 'timestamp is in future',
  GRAFFITI = 'Graffiti field is not 32 bytes in length',
  INVALID_SPEND = 'Invalid spend',
}

/**
 * Indicate whether some entity is valid, and if not, provide a reason and
 * hash.
 */
export interface VerificationResult {
  valid: Validity
  reason?: VerificationResultReason
  hash?: BlockHash
}
