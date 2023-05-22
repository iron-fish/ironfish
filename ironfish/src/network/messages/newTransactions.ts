/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { Transaction } from '../../primitives/transaction'
import { NetworkMessageType } from '../types'
import { getTransactionSize, readTransaction, writeTransaction } from '../utils/serializers'
import { NetworkMessage } from './networkMessage'

export class NewTransactionsMessage extends NetworkMessage {
  readonly transactions: Transaction[]

  constructor(transactions: Transaction[]) {
    super(NetworkMessageType.NewTransactions)
    this.transactions = transactions
  }

  serializePayload(bw: bufio.StaticWriter | bufio.BufferWriter): void {
    bw.writeVarint(this.transactions.length)
    for (const transaction of this.transactions) {
      writeTransaction(bw, transaction)
    }
  }

  static deserializePayload(buffer: Buffer): NewTransactionsMessage {
    const reader = bufio.read(buffer, true)

    const length = reader.readVarint()

    const transactions: Transaction[] = []
    for (let i = 0; i < length; i++) {
      const transaction = readTransaction(reader)
      transactions.push(transaction)
    }

    return new NewTransactionsMessage(transactions)
  }

  getSize(): number {
    let size = 0

    size += bufio.sizeVarint(this.transactions.length)

    for (const transaction of this.transactions) {
      size += getTransactionSize(transaction)
    }

    return size
  }
}
