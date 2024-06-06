/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { isExpiredSequence } from '../../consensus'
import { GENESIS_BLOCK_SEQUENCE } from '../../primitives'
import { IDatabaseTransaction } from '../../storage'
import { Account } from '../account/account'
import { TransactionValue } from '../walletdb/transactionValue'

export enum TransactionStatus {
  CONFIRMED = 'confirmed',
  EXPIRED = 'expired',
  PENDING = 'pending',
  UNCONFIRMED = 'unconfirmed',
  UNKNOWN = 'unknown',
}

export enum TransactionType {
  SEND = 'send',
  RECEIVE = 'receive',
  MINER = 'miner',
}

export async function getTransactionStatus(
  account: Account,
  transaction: TransactionValue,
  confirmations: number,
  options?: {
    headSequence?: number | null
  },
  tx?: IDatabaseTransaction,
): Promise<TransactionStatus> {
  const headSequence = options?.headSequence ?? (await account.getHead(tx))?.sequence

  if (!headSequence) {
    return TransactionStatus.UNKNOWN
  }

  if (transaction.sequence) {
    const isConfirmed =
      transaction.sequence === GENESIS_BLOCK_SEQUENCE ||
      headSequence - transaction.sequence >= confirmations

    return isConfirmed ? TransactionStatus.CONFIRMED : TransactionStatus.UNCONFIRMED
  } else {
    const isExpired = isExpiredSequence(transaction.transaction.expiration(), headSequence)

    return isExpired ? TransactionStatus.EXPIRED : TransactionStatus.PENDING
  }
}

export async function getTransactionType(
  account: Account,
  transaction: TransactionValue,
  tx?: IDatabaseTransaction,
): Promise<TransactionType> {
  if (transaction.transaction.isMinersFee()) {
    return TransactionType.MINER
  }

  for (const spend of transaction.transaction.spends) {
    if ((await account.getNoteHash(spend.nullifier, tx)) !== undefined) {
      return TransactionType.SEND
    }
  }

  for (const note of transaction.transaction.notes) {
    const decryptedNote = await account.getDecryptedNote(note.hash(), tx)

    if (!decryptedNote) {
      continue
    }

    if (decryptedNote.note.sender() === account.publicAddress) {
      return TransactionType.SEND
    }
  }

  return TransactionType.RECEIVE
}
