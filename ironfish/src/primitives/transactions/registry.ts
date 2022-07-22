/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { MinersFeeTransaction } from './minersFeeTransaction'
import { Transaction, TransactionType } from './transaction'
import { TransferTransaction } from './transferTransaction'

export function parseTransaction(buffer: Buffer): Transaction {
  const reader = bufio.read(buffer, true)
  const type = reader.readU8()
  const data = reader.readVarBytes()

  switch (type) {
    case TransactionType.MinersFee:
      return new MinersFeeTransaction(data)
    case TransactionType.Transfer:
      return new TransferTransaction(data)
    default:
      throw new Error(`Invalid transaction type: ${type}`)
  }
}
