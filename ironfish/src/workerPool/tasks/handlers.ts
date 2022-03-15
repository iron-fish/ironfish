/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CreateMinersFeeTask } from './createMinersFee'
import { GetUnspentNotesTask } from './getUnspentNotes'
import { SubmitTelemetryTask } from './submitTelemetry'
import { VerifyTransactionTask } from './verifyTransaction'
import { WorkerMessageType } from './workerMessage'
import { WorkerTask } from './workerTask'

export const handlers: Record<WorkerMessageType, WorkerTask | undefined> = {
  [WorkerMessageType.CreateMinersFee]: CreateMinersFeeTask.getInstance(),
  [WorkerMessageType.GetUnspentNotes]: GetUnspentNotesTask.getInstance(),
  [WorkerMessageType.JobError]: undefined,
  [WorkerMessageType.SubmitTelemetry]: SubmitTelemetryTask.getInstance(),
  [WorkerMessageType.VerifyTransaction]: VerifyTransactionTask.getInstance(),
}
