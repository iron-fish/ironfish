/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { DecryptedNoteValue } from '../../../wallet/walletdb/decryptedNoteValue'
import { TransactionValue } from '../../../wallet/walletdb/transactionValue'

export type RpcAccountTransaction = {
  hash: string
  isMinersFee: boolean
  fee: string
  blockHash?: string
  blockSequence?: number
  notesCount: number
  spendsCount: number
  expirationSequence: number
}

export type RpcAccountDecryptedNote = {
  value: string
  memo: string
  transactionHash: string
  spent: boolean
}

export function serializeRpcAccountTransaction(
  transaction: TransactionValue,
): RpcAccountTransaction {
  return {
    hash: transaction.transaction.unsignedHash().toString('hex'),
    isMinersFee: transaction.transaction.isMinersFee(),
    fee: transaction.transaction.fee().toString(),
    blockHash: transaction.blockHash?.toString('hex'),
    blockSequence: transaction.sequence ?? undefined,
    notesCount: transaction.transaction.notesLength(),
    spendsCount: transaction.transaction.spendsLength(),
    expirationSequence: transaction.transaction.expirationSequence(),
  }
}

export function serializeRpcAccountDecryptedNote(
  note: DecryptedNoteValue,
): RpcAccountDecryptedNote {
  return {
    value: note.note.value().toString(),
    memo: note.note.memo(),
    transactionHash: note.transactionHash.toString('hex'),
    spent: note.spent,
  }
}
