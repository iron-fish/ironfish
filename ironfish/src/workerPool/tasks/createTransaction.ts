/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Note, Transaction } from '@ironfish/rust-nodejs'
import { Witness } from '../../merkletree'
import { NoteHasher } from '../../merkletree/hasher'
import { Side } from '../../merkletree/merkletree'

// Needed for constructing a witness when creating transactions
const noteHasher = new NoteHasher()

export type CreateTransactionRequest = {
  type: 'createTransaction'
  spendKey: string
  transactionFee: bigint
  expirationSequence: number
  spends: {
    note: Buffer
    treeSize: number
    rootHash: Buffer
    authPath: {
      side: Side
      hashOfSibling: Buffer
    }[]
  }[]
  receives: { publicAddress: string; amount: bigint; memo: string }[]
}

export type CreateTransactionResponse = {
  type: 'createTransaction'
  serializedTransactionPosted: Uint8Array
}

export function handleCreateTransaction({
  transactionFee,
  spendKey,
  spends,
  receives,
  expirationSequence,
}: CreateTransactionRequest): CreateTransactionResponse {
  const transaction = new Transaction()
  transaction.setExpirationSequence(expirationSequence)

  for (const spend of spends) {
    const note = Note.deserialize(spend.note)
    transaction.spend(
      spendKey,
      note,
      new Witness(spend.treeSize, spend.rootHash, spend.authPath, noteHasher),
    )
  }

  for (const { publicAddress, amount, memo } of receives) {
    const note = new Note(publicAddress, amount, memo)
    transaction.receive(spendKey, note)
  }

  const serializedTransactionPosted = transaction.post(spendKey, undefined, transactionFee)

  return { type: 'createTransaction', serializedTransactionPosted }
}
