/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Account } from '../../account'
import { Transaction } from '../../primitives/transaction'

export function isTransactionMine(transaction: Transaction, account: Account): boolean {
  for (const note of transaction.notes()) {
    const receivedNote = note.decryptNoteForOwner(account.incomingViewKey)
    if (receivedNote) {
      return true
    }

    const spentNote = note.decryptNoteForSpender(account.outgoingViewKey)
    if (spentNote) {
      return true
    }
  }

  return false
}
