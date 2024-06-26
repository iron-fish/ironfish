/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { IDatabaseEncoding } from '../../storage/database/types'
import bufio from 'bufio'
import { Transaction } from '../../primitives/transaction'

export type TransactionsValue = {
  transactions: Transaction[]
}

export class TransactionsValueEncoding implements IDatabaseEncoding<TransactionsValue> {
  serialize(value: TransactionsValue): Buffer {
    const bw = bufio.write(this.getSize(value))

    for (const tx of value.transactions) {
      bw.writeVarBytes(tx.serialize())
    }

    return bw.render()
  }

  deserialize(buffer: Buffer): TransactionsValue {
    const reader = bufio.read(buffer, true)

    const transactions = []

    while (reader.left()) {
      transactions.push(new Transaction(reader.readVarBytes(), { skipValidation: true }))
    }

    return { transactions }
  }

  getSize(value: TransactionsValue): number {
    let size = 0
    for (const tx of value.transactions) {
      size += bufio.sizeVarBytes(tx.serialize())
    }
    return size
  }
}
