/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { SerializedTransaction } from '../../primitives/transaction'
import { NetworkMessageType } from '../types'
import { NetworkMessage } from './networkMessage'

export class NewTransactionV2Message extends NetworkMessage {
  readonly transaction: SerializedTransaction

  constructor(transaction: SerializedTransaction) {
    super(NetworkMessageType.NewTransactionV2)
    this.transaction = transaction
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    bw.writeVarBytes(this.transaction)
    return bw.render()
  }

  static deserialize(buffer: Buffer): NewTransactionV2Message {
    const reader = bufio.read(buffer, true)
    const transaction = reader.readVarBytes()
    return new NewTransactionV2Message(transaction)
  }

  getSize(): number {
    return bufio.sizeVarBytes(this.transaction)
  }
}
