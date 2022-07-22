/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { IDatabaseEncoding } from '../../storage/database/types'
import bufio from 'bufio'
import { MinersFeeTransaction } from '../../primitives/transactions/minersFeeTransaction'
import { Transaction, TransactionType } from '../../primitives/transactions/transaction'
import { TransferTransaction } from '../../primitives/transactions/transferTransaction'

export type TransactionsValue = {
  transactions: Transaction[]
}

export class TransactionsValueEncoding implements IDatabaseEncoding<TransactionsValue> {
  serialize(value: TransactionsValue): Buffer {
    const bw = bufio.write(this.getSize(value))

    for (const tx of value.transactions) {
      bw.writeU8(tx.type)
      bw.writeVarBytes(tx.serialize())
    }

    return bw.render()
  }

  deserialize(buffer: Buffer): TransactionsValue {
    const reader = bufio.read(buffer, true)

    const transactions = []
    while (reader.left()) {
      const type = reader.readU8()
      const serializedTransaction = reader.readVarBytes()

      switch (type) {
        case TransactionType.MinersFee:
          transactions.push(new MinersFeeTransaction(serializedTransaction))
          break
        case TransactionType.Transfer:
          transactions.push(new TransferTransaction(serializedTransaction))
          break
      }
    }

    return { transactions }
  }

  getSize(value: TransactionsValue): number {
    let size = 0
    for (const tx of value.transactions) {
      size += bufio.sizeVarBytes(tx.serialize()) + 1
    }
    return size
  }
}
