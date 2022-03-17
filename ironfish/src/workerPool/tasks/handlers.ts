/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BoxMessageTask } from './boxMessage'
import { CreateMinersFeeTask } from './createMinersFee'
import { CreateTransactionTask } from './createTransaction'
import { GetUnspentNotesTask } from './getUnspentNotes'
import { SleepTask } from './sleep'
import { SubmitTelemetryTask } from './submitTelemetry'
import { TransactionFeeTask } from './transactionFee'
import { UnboxMessageTask } from './unboxMessage'
import { VerifyTransactionTask } from './verifyTransaction'
import { WorkerMessageType } from './workerMessage'
import { WorkerTask } from './workerTask'

export const handlers: Record<WorkerMessageType, WorkerTask | undefined> = {
  [WorkerMessageType.BoxMessage]: BoxMessageTask.getInstance(),
  [WorkerMessageType.CreateMinersFee]: CreateMinersFeeTask.getInstance(),
  [WorkerMessageType.CreateTransaction]: CreateTransactionTask.getInstance(),
  [WorkerMessageType.GetUnspentNotes]: GetUnspentNotesTask.getInstance(),
  [WorkerMessageType.JobAbort]: undefined,
  [WorkerMessageType.JobError]: undefined,
  [WorkerMessageType.Sleep]: SleepTask.getInstance(),
  [WorkerMessageType.SubmitTelemetry]: SubmitTelemetryTask.getInstance(),
  [WorkerMessageType.TransactionFee]: TransactionFeeTask.getInstance(),
  [WorkerMessageType.UnboxMessage]: UnboxMessageTask.getInstance(),
  [WorkerMessageType.VerifyTransaction]: VerifyTransactionTask.getInstance(),
}
