/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { generateNewPublicAddress, Note, Transaction } from '@ironfish/rust-nodejs'

export type CreateMinersFeeRequest = {
  type: 'createMinersFee'
  spendKey: string
  amount: bigint
  memo: string
}

export type CreateMinersFeeResponse = {
  type: 'createMinersFee'
  serializedTransactionPosted: Uint8Array
}

export function handleCreateMinersFee({
  spendKey,
  amount,
  memo,
}: CreateMinersFeeRequest): CreateMinersFeeResponse {
  // Generate a public address from the miner's spending key
  const minerPublicAddress = generateNewPublicAddress(spendKey).public_address

  const minerNote = new Note(minerPublicAddress, amount, memo)

  const transaction = new Transaction()
  transaction.receive(spendKey, minerNote)

  const serializedTransactionPosted = transaction.post_miners_fee()

  return { type: 'createMinersFee', serializedTransactionPosted }
}
