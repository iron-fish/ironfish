/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { IDatabaseEncoding } from '../../storage/database/types'
import bufio from 'bufio'
import { Transaction } from '../../primitives/transaction'

export class TransactionEncoding implements IDatabaseEncoding<Transaction> {
  serialize(transaction: Transaction): Buffer {
    const bw = bufio.write(this.getSize(transaction))

    bw.writeVarBytes(transaction.serialize())

    return bw.render()
  }

  deserialize(buffer: Buffer): Transaction {
    const reader = bufio.read(buffer, true)

    return new Transaction(reader.readVarBytes())
  }

  getSize(transaction: Transaction): number {
    return bufio.sizeVarBytes(transaction.serialize())
  }
}
