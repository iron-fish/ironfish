/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Transaction } from '../../primitives/transaction'

function areTransactionsEqual(a: unknown, b: unknown): boolean | undefined {
  const isATransaction = a instanceof Transaction
  const isBTransaction = b instanceof Transaction

  if (isATransaction && isBTransaction) {
    return a.equals(b)
  } else if (!isATransaction && !isBTransaction) {
    return undefined
  } else {
    return false
  }
}

expect.addEqualityTesters([areTransactionsEqual])
