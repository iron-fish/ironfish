/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Job } from '../job'
import { BoxMessageTask } from './boxMessage'
import { CreateMinersFeeTask } from './createMinersFee'
import { CreateTransactionTask } from './createTransaction'
import { SleepTask } from './sleep'
import { SubmitTelemetryTask } from './submitTelemetry'
import { UnboxMessageTask } from './unboxMessage'
import { VerifyTransactionTask } from './verifyTransaction'
import { WorkerMessage, WorkerMessageType } from './workerMessage'
import { WorkerTask } from './workerTask'

export const handlers: Record<WorkerMessageType, WorkerTask | undefined> = {
  [WorkerMessageType.BoxMessage]: BoxMessageTask.getInstance(),
  [WorkerMessageType.CreateMinersFee]: CreateMinersFeeTask.getInstance(),
  [WorkerMessageType.CreateTransaction]: CreateTransactionTask.getInstance(),
  [WorkerMessageType.JobAborted]: undefined,
  [WorkerMessageType.JobError]: undefined,
  [WorkerMessageType.Sleep]: SleepTask.getInstance(),
  [WorkerMessageType.SubmitTelemetry]: SubmitTelemetryTask.getInstance(),
  [WorkerMessageType.UnboxMessage]: UnboxMessageTask.getInstance(),
  [WorkerMessageType.VerifyTransaction]: VerifyTransactionTask.getInstance(),
}

export async function handleRequest(request: WorkerMessage, job: Job): Promise<WorkerMessage> {
  const handler = handlers[request.type]
  if (!handler) {
    throw new Error(`No handler found for ${request.type}`)
  }
  return handler.execute(request, job)
}
