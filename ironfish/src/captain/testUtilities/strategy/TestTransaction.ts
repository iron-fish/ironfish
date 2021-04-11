/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  VerificationResult,
  VerificationResultReason,
  Validity,
} from '../../../consensus/verifier'
import { Spend, default as Transaction } from '../../../strategy/transaction'
import { StringUtils } from '../../../utils'

export class TestTransaction<H = string> implements Transaction<string, H> {
  isValid: boolean
  elements: string[]
  _spends: Spend<H>[]
  totalFees: bigint

  constructor(
    isValid = true,
    elements: string[] = [],
    totalFees: number | bigint = 0,
    spends: Spend<H>[] = [],
  ) {
    this.elements = elements
    this._spends = spends
    this.totalFees = BigInt(totalFees)
    this.isValid = isValid
  }

  verify(): VerificationResult {
    return {
      valid: this.isValid ? Validity.Yes : Validity.No,
      reason: this.isValid ? undefined : VerificationResultReason.INVALID_TRANSACTION_PROOF,
    }
  }

  takeReference(): boolean {
    return true
  }

  returnReference(): void {
    return
  }

  withReference<R>(callback: (transaction: TestTransaction<H>) => R): R {
    return callback(this)
  }

  notesLength(): number {
    return this.elements.length
  }

  *notes(): Iterable<string> {
    yield* this.elements
  }

  spendsLength(): number {
    return this._spends.length
  }

  *spends(): Iterable<Spend<H>> {
    yield* this._spends
  }

  transactionFee(): bigint {
    return this.totalFees
  }

  transactionSignature(): Buffer {
    return Buffer.from('sig')
  }

  transactionHash(): Buffer {
    return StringUtils.hash(
      JSON.stringify(this.elements) + String(this.totalFees) + JSON.stringify(this._spends),
    )
  }
}
