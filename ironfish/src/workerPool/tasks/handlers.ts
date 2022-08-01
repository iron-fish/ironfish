/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Job } from '../job'
import { BoxMessageTask } from './boxMessage'
import { CreateMinersFeeTask } from './createMinersFee'
import { CreateTransactionTask } from './createTransaction'
import { DecryptNotesTask } from './decryptNotes'
import { GetUnspentNotesTask } from './getUnspentNotes'
import { SleepTask } from './sleep'
import { SubmitTelemetryTask } from './submitTelemetry'
import { UnboxMessageTask } from './unboxMessage'
import { VerifyTransactionTask } from './verifyTransaction'
import { VerifyTransactionsTask } from './verifyTransactions'
import { WorkerMessage, WorkerMessageType } from './workerMessage'
import { WorkerTask } from './workerTask'

export const handlers: Record<WorkerMessageType, WorkerTask | undefined> = {
  [WorkerMessageType.BoxMessage]: BoxMessageTask.getInstance(),
  [WorkerMessageType.CreateMinersFee]: CreateMinersFeeTask.getInstance(),
  [WorkerMessageType.CreateTransaction]: CreateTransactionTask.getInstance(),
  [WorkerMessageType.DecryptNotes]: DecryptNotesTask.getInstance(),
  [WorkerMessageType.GetUnspentNotes]: GetUnspentNotesTask.getInstance(),
  [WorkerMessageType.JobAborted]: undefined,
  [WorkerMessageType.JobError]: undefined,
  [WorkerMessageType.Sleep]: SleepTask.getInstance(),
  [WorkerMessageType.SubmitTelemetry]: SubmitTelemetryTask.getInstance(),
  [WorkerMessageType.UnboxMessage]: UnboxMessageTask.getInstance(),
  [WorkerMessageType.VerifyTransaction]: VerifyTransactionTask.getInstance(),
  [WorkerMessageType.VerifyTransactions]: VerifyTransactionsTask.getInstance(),
}

export async function handleRequest(request: WorkerMessage, job: Job): Promise<WorkerMessage> {
  const handler = handlers[request.type]
  if (!handler) {
    throw new Error(`No handler found for ${request.type}`)
  }
  return handler.execute(request, job)
}
