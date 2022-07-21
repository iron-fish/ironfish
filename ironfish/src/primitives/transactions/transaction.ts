/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
export type TransactionHash = Buffer
export type SerializedTransaction = Buffer

export enum TransactionType {
  Transfer = 0,
  MinersFee = 1,
}

export abstract class Transaction {
  readonly type: TransactionType

  constructor(type: TransactionType) {
    this.type = type
  }

  abstract serialize(): Buffer

  equals(other: Transaction): boolean {
    return this.serialize().equals(other.serialize())
  }
}
