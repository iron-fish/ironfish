/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { SubmitTelemetryTask } from './submitTelemetry'
import { WorkerMessageType } from './workerMessage'
import { WorkerTask } from './workerTask'

export const handlers: Record<WorkerMessageType, WorkerTask | undefined> = {
  [WorkerMessageType.JobError]: undefined,
  [WorkerMessageType.SubmitTelemetry]: SubmitTelemetryTask.getInstance(),
}
