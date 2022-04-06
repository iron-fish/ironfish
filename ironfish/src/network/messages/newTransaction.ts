/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { SerializedTransaction } from '../../primitives/transaction'
import { GossipNetworkMessage } from './gossipNetworkMessage'
import { NetworkMessageType } from './networkMessage'

export class NewTransactionMessage extends GossipNetworkMessage {
  readonly transaction: SerializedTransaction

  constructor(transaction: SerializedTransaction, nonce: string) {
    super(NetworkMessageType.NewTransaction, nonce)
    this.transaction = transaction
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    bw.writeVarBytes(this.transaction)
    return bw.render()
  }

  static deserialize(buffer: Buffer, nonce: string): NewTransactionMessage {
    const reader = bufio.read(buffer, true)
    const transaction = reader.readVarBytes()
    return new NewTransactionMessage(transaction, nonce)
  }

  getSize(): number {
    return bufio.sizeVarBytes(this.transaction)
  }
}
