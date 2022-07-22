/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { NoteEncrypted } from '../noteEncrypted'
import { Spend } from '../spend'

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
export type TransactionHash = Buffer
export type SerializedTransaction = Buffer

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
  abstract withReference<R>(callback: (t: unknown) => R): R

  serializeWithType(): Buffer {
    const headerSize = 1
    const data = this.serialize()
    const bw = bufio.write(headerSize + bufio.sizeVarBytes(data))
    bw.writeU8(this.type)
    bw.writeBytes(data)
    return bw.render()
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
