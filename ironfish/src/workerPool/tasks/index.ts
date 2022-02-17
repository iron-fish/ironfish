/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert } from '../../assert'
import { Job } from '../job'
import {
  WorkerRequestMessage,
  WorkerRequestMessageSerialized,
  WorkerResponse,
  WorkerResponseMessage,
  WorkerResponseMessageSerialized,
} from '../messages'
import { handleBoxMessage } from './boxMessage'
import { handleCreateMinersFee } from './createMinersFee'
import { handleCreateTransaction } from './createTransaction'
import { handleGetUnspentNotes } from './getUnspentNotes'
import { handleMineHeader } from './mineHeader'
import { handleSleep } from './sleep'
import { submitTelemetry } from './submitTelemetry'
import { handleTransactionFee } from './transactionFee'
import { handleUnboxMessage } from './unboxMessage'
import { handleVerifyTransaction } from './verifyTransaction'

export { CreateTransactionRequest, CreateTransactionResponse } from './createTransaction'
export { GetUnspentNotesRequest, GetUnspentNotesResponse } from './getUnspentNotes'
export { BoxMessageRequest, BoxMessageResponse } from './boxMessage'
export { CreateMinersFeeRequest, CreateMinersFeeResponse } from './createMinersFee'
export { MineHeaderRequest, MineHeaderResponse } from './mineHeader'
export { SleepRequest, SleepResponse } from './sleep'
export { TransactionFeeRequest, TransactionFeeResponse } from './transactionFee'
export { UnboxMessageRequest, UnboxMessageResponse } from './unboxMessage'
export { VerifyTransactionRequest, VerifyTransactionResponse } from './verifyTransaction'

export async function handleRequest(
  request: WorkerRequestMessage | WorkerRequestMessageSerialized,
  job: Job,
): Promise<WorkerResponseMessage | WorkerResponseMessageSerialized> {
  if (request.body instanceof Uint8Array) {
    return handleSerializedRequest(request as WorkerRequestMessageSerialized, job)
  } else {
    return handleUnserializedRequest(request as WorkerRequestMessage, job)
  }
}

export function handleSerializedRequest(
  serializedRequest: WorkerRequestMessageSerialized,
  job: Job,
): WorkerResponseMessageSerialized {
  // This will be changed to a discriminating structure between
  // request types when additional serializers exist
  const body = serializedRequest.body
  const type = serializedRequest.type.type

  if (type !== 'createMinersFee' && type !== 'createTransaction') {
    throw new Error('unserialized message type being processed by serialized message handler')
  }

  const { responseType, response } =
    type === 'createMinersFee'
      ? handleCreateMinersFee(Buffer.from(body))
      : type === 'createTransaction'
      ? handleCreateTransaction(Buffer.from(body))
      : Assert.isNever(type)
  return { jobId: job.id, type: responseType, body: response }
}

export async function handleUnserializedRequest(
  request: WorkerRequestMessage,
  job: Job,
): Promise<WorkerResponseMessage> {
  let response: WorkerResponse | null = null

  const body = request.body

  switch (body.type) {
    case 'createMinersFee':
      throw new Error('createMinersFee should be serialized')
    case 'createTransaction':
      throw new Error('createTransaction should be serialized')
    case 'getUnspentNotes':
      response = handleGetUnspentNotes(body)
      break
    case 'transactionFee':
      response = handleTransactionFee(body)
      break
    case 'verify':
      response = handleVerifyTransaction(body)
      break
    case 'boxMessage':
      response = handleBoxMessage(body)
      break
    case 'unboxMessage':
      response = handleUnboxMessage(body)
      break
    case 'mineHeader':
      response = handleMineHeader(body)
      break
    case 'sleep':
      response = await handleSleep(body, job)
      break
    case 'jobAbort':
      throw new Error('ControlMessage not handled')
    case 'submitTelemetry':
      response = await submitTelemetry(body)
      break
    default: {
      Assert.isNever(body)
    }
  }

  return { jobId: request.jobId, body: response }
}
