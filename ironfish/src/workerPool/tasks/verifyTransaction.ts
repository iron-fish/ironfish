/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { TransactionPosted } from '@ironfish/rust-nodejs'

export interface VerifyTransactionOptions {
  verifyFees?: boolean
}

export type VerifyTransactionRequest = {
  type: 'verify'
  serializedTransactionPosted: Buffer
  options?: VerifyTransactionOptions
}

export type VerifyTransactionResponse = {
  type: 'verify'
  verified: boolean
}

export function handleVerifyTransaction({
  serializedTransactionPosted,
  options,
}: VerifyTransactionRequest): VerifyTransactionResponse {
  const verifyFees = options?.verifyFees ?? true
  let transaction

  let verified = false
  try {
    transaction = new TransactionPosted(serializedTransactionPosted)

    if (verifyFees && transaction.fee() < BigInt(0)) {
      throw new Error('Transaction has negative fees')
    }

    verified = transaction.verify()
  } catch {
    verified = false
  }

  return { type: 'verify', verified }
}
