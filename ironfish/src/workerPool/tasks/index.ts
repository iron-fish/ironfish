/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { WorkerMessageType, WorkerRequestMessage, WorkerResponseMessage } from '../messages'
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
  const { body, type } = request

  if (type === WorkerMessageType.jobAbort || type === WorkerMessageType.jobError) {
    throw new Error('ControlMessage not handled')
  }

  const { responseType, response } =
    type === WorkerMessageType.boxMessage
      ? handleBoxMessage(body)
      : type === WorkerMessageType.createMinersFee
      ? handleCreateMinersFee(body)
      : type === WorkerMessageType.createTransaction
      ? handleCreateTransaction(body)
      : type === WorkerMessageType.mineHeader
      ? handleMineHeader(body)
      : type === WorkerMessageType.sleep
      ? await handleSleep(body, job)
      : type === WorkerMessageType.transactionFee
      ? handleTransactionFee(body)
      : type === WorkerMessageType.unboxMessage
      ? handleUnboxMessage(body)
      : type === WorkerMessageType.verify
      ? handleVerifyTransaction(body)
      : Assert.isNever(type)

  return { jobId: request.jobId, type: responseType, body: response }
}
