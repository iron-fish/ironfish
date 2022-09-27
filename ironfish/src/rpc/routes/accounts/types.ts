/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { DecryptedNoteValue } from '../../../wallet/database/decryptedNoteValue'
import { TransactionValue } from '../../../wallet/database/transactionValue'

export type RpcAccountTransaction = {
  isMinersFee: boolean
  fee: string
  notesCount: number
  spendsCount: number
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
    isMinersFee: transaction.transaction.isMinersFee(),
    fee: transaction.transaction.fee().toString(),
    notesCount: transaction.transaction.notesLength(),
    spendsCount: transaction.transaction.spendsLength(),
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
