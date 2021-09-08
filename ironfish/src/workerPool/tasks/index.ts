/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { WorkerRequestMessage, WorkerResponse, WorkerResponseMessage } from '../messages'
import { Assert } from '../../assert'
import { Job } from '../job'
import { handleBoxMessage } from './boxMessage'
import { handleCreateMinersFee } from './createMinersFee'
import { handleCreateTransaction } from './createTransaction'
import { handleMineHeader } from './mineHeader'
import { handleSleep } from './sleep'
import { handleTransactionFee } from './transactionFee'
import { handleUnboxMessage } from './unboxMessage'
import { handleVerifyTransaction } from './verifyTransaction'

export { CreateTransactionRequest, CreateTransactionResponse } from './createTransaction'
export { BoxMessageRequest, BoxMessageResponse } from './boxMessage'
export { CreateMinersFeeRequest, CreateMinersFeeResponse } from './createMinersFee'
export { MineHeaderRequest, MineHeaderResponse } from './mineHeader'
export { SleepRequest, SleepResponse } from './sleep'
export { TransactionFeeRequest, TransactionFeeResponse } from './transactionFee'
export { UnboxMessageRequest, UnboxMessageResponse } from './unboxMessage'
export { VerifyTransactionRequest, VerifyTransactionResponse } from './verifyTransaction'

export async function handleRequest(
  request: WorkerRequestMessage,
  job: Job,
): Promise<WorkerResponseMessage> {
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
      response = handleVerifyTransaction(body)
      break
    case 'boxMessage':
      response = handleBoxMessage(body)
      break
    case 'unboxMessage':
      response = handleUnboxMessage(body)
      break
    case 'mineHeader':
      response = handleMineHeader(body, job)
      break
    case 'sleep':
      response = await handleSleep(body, job)
      break
    case 'jobAbort':
      throw new Error('ControlMessage not handled')
    default: {
      Assert.isNever(body)
    }
  }

  return { jobId: request.jobId, body: response }
}
