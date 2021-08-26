/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { WasmTransactionPosted } from 'ironfish-wasm-nodejs'

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
  const transaction = WasmTransactionPosted.deserialize(serializedTransactionPosted)
  const fee = transaction.transactionFee

  transaction.free()

  return { type: 'transactionFee', transactionFee: fee.valueOf() }
}
