/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { VerificationResult, VerificationResultReason, Verifier } from '../../consensus'
import {
  SerializedTestTransaction,
  TestBlock,
  TestBlockHeader,
  TestTransaction,
} from './strategy'

export class TestVerifier extends Verifier<
  string,
  string,
  TestTransaction,
  string,
  string,
  SerializedTestTransaction
> {
  isValidTarget(): boolean {
    return true
  }

  isValidAgainstPrevious(
    current: TestBlock,
    previousHeader: TestBlockHeader,
  ): VerificationResult {
    let result = super.isValidAgainstPrevious(current, previousHeader)

    if (result.reason === VerificationResultReason.INVALID_TARGET) {
      result = { valid: true }
    }

    return result
  }
}
