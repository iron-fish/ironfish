/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Request and response message types used for communication
 * between the worker pool and workers.
 */

export type TransactionFeeRequest = {
  type: 'transactionFee'
  requestId: number
  serializedTransactionPosted: Buffer
}

export type TransactionFeeResponse = {
  type: 'transactionFee'
  requestId: number
  transactionFee: bigint
}

export type VerifyTransactionRequest = {
  type: 'verify'
  requestId: number
  serializedTransactionPosted: Buffer
}

export type VerifyTransactionResponse = {
  type: 'verify'
  requestId: number
  verified: boolean
}

export type OmitRequestId<T> = Omit<T, 'requestId'>

export type WorkerRequest = TransactionFeeRequest | VerifyTransactionRequest
export type WorkerResponse = TransactionFeeResponse | VerifyTransactionResponse
