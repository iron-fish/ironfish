/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { SerializedTransaction } from '../../primitives/transaction'
import { NetworkMessageType } from '../types'
import { NetworkMessage } from './networkMessage'

export class NewTransactionV2Message extends NetworkMessage {
  readonly transactions: SerializedTransaction[]

  constructor(transactions: SerializedTransaction[]) {
    super(NetworkMessageType.NewTransactionV2)
    this.transactions = transactions
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())

    bw.writeVarint(this.transactions.length)
    for (const transaction of this.transactions) {
      bw.writeVarBytes(transaction)
    }
    return bw.render()
  }

  static deserialize(buffer: Buffer): NewTransactionV2Message {
    const reader = bufio.read(buffer, true)

    const length = reader.readVarint()

    const transactions = []
    for (let i = 0; i < length; i++) {
      const transaction = reader.readVarBytes()
      transactions.push(transaction)
    }

    return new NewTransactionV2Message(transactions)
  }

  getSize(): number {
    let size = 0

    size += bufio.sizeVarint(this.transactions.length)

    for (const transaction of this.transactions) {
      size += bufio.sizeVarBytes(transaction)
    }

    return size
  }
}
