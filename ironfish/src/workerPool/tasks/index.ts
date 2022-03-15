/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { WorkerRequestMessage, WorkerResponse, WorkerResponseMessage } from '../messages'
import { Assert } from '../../assert'
import { Job } from '../job'
import { handleBoxMessage } from './boxMessage'
import { handleCreateTransaction } from './createTransaction'
import { handleGetUnspentNotes } from './getUnspentNotes'
import { handlers } from './handlers'
import { handleTransactionFee } from './transactionFee'
import { handleUnboxMessage } from './unboxMessage'
import { WorkerMessage } from './workerMessage'

export { CreateTransactionRequest, CreateTransactionResponse } from './createTransaction'
export { GetUnspentNotesRequest, GetUnspentNotesResponse } from './getUnspentNotes'
export { BoxMessageRequest, BoxMessageResponse } from './boxMessage'
export { CreateMinersFeeRequest, CreateMinersFeeResponse } from './createMinersFee'
export { SleepRequest, SleepResponse } from './sleep'
export { TransactionFeeRequest, TransactionFeeResponse } from './transactionFee'
export { UnboxMessageRequest, UnboxMessageResponse } from './unboxMessage'

export async function handleRequest(
  request: WorkerRequestMessage | WorkerMessage,
  job: Job,
): Promise<WorkerResponseMessage | WorkerMessage> {
  let response: WorkerResponse | WorkerMessage | null = null

  if (!('body' in request)) {
    const handler = handlers[request.type]
    if (!handler) {
      throw new Error()
    }
    return handler.execute(request, job)
  }

  const body = request.body

  switch (body.type) {
    case 'createTransaction':
      response = handleCreateTransaction(body)
      break
    case 'getUnspentNotes':
      response = handleGetUnspentNotes(body)
      break
    case 'transactionFee':
      response = handleTransactionFee(body)
      break
    case 'boxMessage':
      response = handleBoxMessage(body)
      break
    case 'unboxMessage':
      response = handleUnboxMessage(body)
      break
    case 'jobAbort':
      throw new Error('ControlMessage not handled')
    default: {
      Assert.isNever(body)
    }
  }

  return { jobId: request.jobId, body: response }
}
