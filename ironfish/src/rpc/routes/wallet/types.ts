/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { TransactionValue } from '../../../wallet/walletdb/transactionValue'

export type RpcAccountTransaction = {
  hash: Buffer
  isMinersFee: boolean
  fee: string
  blockHash?: Buffer
  blockSequence?: number
  notesCount: number
  spendsCount: number
  mintsCount: number
  burnsCount: number
  expiration: number
  timestamp: number
}

export type RpcAccountDecryptedNote = {
  owner: boolean
  value: string
  assetId: Buffer
  assetName: Buffer
  memo: string
  sender: string
  spent: boolean
}

export function serializeRpcAccountTransaction(
  transaction: TransactionValue,
): RpcAccountTransaction {
  return {
    hash: transaction.transaction.hash(),
    isMinersFee: transaction.transaction.isMinersFee(),
    fee: transaction.transaction.fee().toString(),
    blockHash: transaction.blockHash ?? undefined,
    blockSequence: transaction.sequence ?? undefined,
    notesCount: transaction.transaction.notes.length,
    spendsCount: transaction.transaction.spends.length,
    mintsCount: transaction.transaction.mints.length,
    burnsCount: transaction.transaction.burns.length,
    expiration: transaction.transaction.expiration(),
    timestamp: transaction.timestamp.getTime(),
  }
}
