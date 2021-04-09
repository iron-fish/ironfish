/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { TestTransaction } from './TestTransaction'
import { SerializedTestTransaction } from './SerializedTypes'
import Verifier from '../../../consensus/verifier'
import { Validity, VerificationResult } from '../../anchorChain/blockchain'
import { VerificationResultReason } from '../../anchorChain/blockchain/VerificationResult'
import { TestBlock, TestBlockHeader } from '../helpers'

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

    if (result.reason === VerificationResultReason.INVALID_TARGET)
      result = { valid: Validity.Yes }

    return result
  }
}
