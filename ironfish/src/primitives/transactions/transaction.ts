import { NoteEncrypted } from "../noteEncrypted"
import { Spend } from "../spend"
import { MinersFeeTransaction } from "./minersFeeTransaction"
import { TransferTransaction } from "./transferTransaction"

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
export type TransactionHash = Buffer
export interface SerializedTransaction {
  type: TransactionType
  data: Buffer
}

export enum TransactionType {
  MinersFee = 0,
  Transfer = 1,
}

export abstract class Transaction {
  readonly type: TransactionType

  constructor(type: TransactionType) {
    this.type = type
  }

  abstract expirationSequence(): number
  abstract fee(): bigint
  abstract hash(): Buffer
  abstract notes(): NoteEncrypted[]
  abstract signature(): Buffer
  abstract spends(): Spend[]
  abstract unsignedHash(): Buffer

  abstract serialize(): Buffer
  abstract withReference<R>(callback: Function): R

  static deserialize(type: TransactionType, data: Buffer): Transaction {
    switch (type) {
      case TransactionType.MinersFee:
        return new MinersFeeTransaction(data)
      case TransactionType.Transfer:
        return new TransferTransaction(data)
    }
  }

  equals(other: Transaction): boolean {
    return this.serialize().equals(other.serialize())
  }
  
  getNote(index: number): NoteEncrypted {
    return this.notes()[index]
  }

  getSpend(index: number): Spend {
    return this.spends()[index]
  }
}
