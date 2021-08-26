/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { WasmTransactionPosted } from 'ironfish-wasm-nodejs'

export type VerifyTransactionRequest = {
  type: 'verify'
  serializedTransactionPosted: Buffer
}

export type VerifyTransactionResponse = {
  type: 'verify'
  verified: boolean
}

export function handleVerifyTransaction({
  serializedTransactionPosted,
}: VerifyTransactionRequest): VerifyTransactionResponse {
  let transaction

  let verified = false
  try {
    transaction = WasmTransactionPosted.deserialize(serializedTransactionPosted)
    verified = transaction.verify()
  } catch {
    verified = false
  } finally {
    transaction?.free()
  }

  return { type: 'verify', verified }
}
