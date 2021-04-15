/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Handler for Worker messages.
 */

import { generateKey, WasmTransactionPosted } from 'ironfish-wasm-nodejs'
import { parentPort, MessagePort } from 'worker_threads'
import type {
  TransactionFeeRequest,
  TransactionFeeResponse,
  VerifyTransactionRequest,
  VerifyTransactionResponse,
  WorkerRequest,
  WorkerResponse,
} from './messages'

function handleVerify({
  requestId,
  serializedTransactionPosted,
}: VerifyTransactionRequest): VerifyTransactionResponse {
  const transaction = WasmTransactionPosted.deserialize(serializedTransactionPosted)
  const verified = transaction.verify()
  transaction.free()
  return { type: 'verify', requestId, verified }
}

function handleTransactionFee({
  requestId,
  serializedTransactionPosted,
}: TransactionFeeRequest): TransactionFeeResponse {
  const transaction = WasmTransactionPosted.deserialize(serializedTransactionPosted)
  const fee = transaction.transactionFee
  transaction.free()
  return { type: 'transactionFee', requestId, transactionFee: BigInt(fee) }
}

function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(x)}`)
}

export function handleRequest(request: WorkerRequest): WorkerResponse | null {
  let message: WorkerResponse | null = null

  switch (request.type) {
    case 'verify':
      message = handleVerify(request)
      break
    case 'transactionFee':
      message = handleTransactionFee(request)
      break
    default: {
      assertNever(request)
    }
  }

  return message
}

function onMessage(port: MessagePort, request: WorkerRequest) {
  const response = handleRequest(request)

  if (response !== null) {
    port.postMessage(response)
  }
}

if (parentPort !== null) {
  // Trigger loading of Sapling parameters if we're in a worker thread
  generateKey()

  const port = parentPort
  port.on('message', (request: WorkerRequest) => onMessage(port, request))
}
