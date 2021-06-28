/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Handler for Worker messages.
 */

import type {
  BoxMessageRequest,
  BoxMessageResponse,
  CreateMinersFeeRequest,
  CreateMinersFeeResponse,
  CreateTransactionRequest,
  CreateTransactionResponse,
  TransactionFeeRequest,
  TransactionFeeResponse,
  UnboxMessageRequest,
  UnboxMessageResponse,
  VerifyTransactionRequest,
  VerifyTransactionResponse,
  WorkerRequestMessage,
  WorkerResponse,
  WorkerResponseMessage,
} from './messages'
import {
  generateKey,
  generateNewPublicAddress,
  WasmNote,
  WasmTransaction,
  WasmTransactionPosted,
} from 'ironfish-wasm-nodejs'
import { MessagePort, parentPort } from 'worker_threads'
import { Assert } from '../assert'
import { Witness } from '../merkletree'
import { NoteHasher } from '../merkletree/hasher'
import { boxMessage, unboxMessage } from '../network/peers/encryption'

// Global constants
// Needed for constructing a witness when creating transactions
const noteHasher = new NoteHasher()

function handleCreateMinersFee({
  spendKey,
  amount,
  memo,
}: CreateMinersFeeRequest): CreateMinersFeeResponse {
  // Generate a public address from the miner's spending key
  const minerPublicAddress = generateNewPublicAddress(spendKey).public_address

  const minerNote = new WasmNote(minerPublicAddress, amount, memo)

  const transaction = new WasmTransaction()
  transaction.receive(spendKey, minerNote)

  const postedTransaction = transaction.post_miners_fee()

  const serializedTransactionPosted = Buffer.from(postedTransaction.serialize())

  minerNote.free()
  transaction.free()
  postedTransaction.free()

  return { type: 'createMinersFee', serializedTransactionPosted }
}

function handleCreateTransaction({
  transactionFee,
  spendKey,
  spends,
  receives,
}: CreateTransactionRequest): CreateTransactionResponse {
  const transaction = new WasmTransaction()

  for (const spend of spends) {
    const note = WasmNote.deserialize(spend.note)
    transaction.spend(
      spendKey,
      note,
      new Witness(spend.treeSize, spend.rootHash, spend.authPath, noteHasher),
    )
    note.free()
  }

  for (const { publicAddress, amount, memo } of receives) {
    const note = new WasmNote(publicAddress, amount, memo)
    transaction.receive(spendKey, note)
    note.free()
  }

  const postedTransaction = transaction.post(spendKey, undefined, transactionFee)

  const serializedTransactionPosted = Buffer.from(postedTransaction.serialize())

  transaction.free()
  postedTransaction.free()

  return { type: 'createTransaction', serializedTransactionPosted }
}

function handleTransactionFee({
  serializedTransactionPosted,
}: TransactionFeeRequest): TransactionFeeResponse {
  const transaction = WasmTransactionPosted.deserialize(serializedTransactionPosted)
  const fee = transaction.transactionFee
  transaction.free()
  return { type: 'transactionFee', transactionFee: fee.valueOf() }
}

function handleVerify({
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

function handleBoxMessage({
  message,
  sender,
  recipient,
}: BoxMessageRequest): BoxMessageResponse {
  const { nonce, boxedMessage } = boxMessage(message, sender, recipient)
  return {
    type: 'boxMessage',
    nonce,
    boxedMessage,
  }
}

function handleUnboxMessage({
  boxedMessage,
  nonce,
  sender,
  recipient,
}: UnboxMessageRequest): UnboxMessageResponse {
  const result = unboxMessage(boxedMessage, nonce, sender, recipient)
  return {
    type: 'unboxMessage',
    message: result === null ? null : Buffer.from(result).toString('utf8'),
  }
}

export function handleRequest(request: WorkerRequestMessage): WorkerResponseMessage | null {
  let response: WorkerResponse | null = null

  const body = request.body

  switch (body.type) {
    case 'createMinersFee':
      response = handleCreateMinersFee(body)
      break
    case 'createTransaction':
      response = handleCreateTransaction(body)
      break
    case 'transactionFee':
      response = handleTransactionFee(body)
      break
    case 'verify':
      response = handleVerify(body)
      break
    case 'boxMessage':
      response = handleBoxMessage(body)
      break
    case 'unboxMessage':
      response = handleUnboxMessage(body)
      break
    default: {
      Assert.isNever(body)
    }
  }

  return { requestId: request.requestId, body: response }
}

function onMessage(port: MessagePort, request: WorkerRequestMessage) {
  const response = handleRequest(request)

  if (response !== null) {
    port.postMessage(response)
  }
}

if (parentPort !== null) {
  // Trigger loading of Sapling parameters if we're in a worker thread
  generateKey()

  const port = parentPort
  port.on('message', (request: WorkerRequestMessage) => onMessage(port, request))
}
