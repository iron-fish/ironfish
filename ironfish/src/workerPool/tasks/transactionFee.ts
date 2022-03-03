/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { TransactionPosted } from '@ironfish/rust-nodejs'

export type TransactionFeeRequest = {
  type: 'transactionFee'
  serializedTransactionPosted: Buffer
}

export type TransactionFeeResponse = {
  type: 'transactionFee'
  transactionFee: bigint
}

export function handleTransactionFee({
  serializedTransactionPosted,
}: TransactionFeeRequest): TransactionFeeResponse {
  const transaction = new TransactionPosted(serializedTransactionPosted)
  const fee = transaction.fee()

  return { type: 'transactionFee', transactionFee: fee }
}
