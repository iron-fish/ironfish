/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { WorkerMessageType } from './tasks/workerMessage'

export function workerMessageTypeToString(type: WorkerMessageType): string {
  switch (type) {
    case WorkerMessageType.CreateMinersFee:
      return 'CreateMinersFee'
    case WorkerMessageType.CreateTransaction:
      return 'CreateTransaction'
    case WorkerMessageType.GetUnspentNotes:
      return 'GetUnspentNotes'
    case WorkerMessageType.JobAbort:
      return 'JobAbort'
    case WorkerMessageType.JobError:
      return 'JobError'
    case WorkerMessageType.Sleep:
      return 'Sleep'
    case WorkerMessageType.SubmitTelemetry:
      return 'SubmitTelemetry'
    case WorkerMessageType.UnboxMessage:
      return 'UnboxMessage'
    case WorkerMessageType.VerifyTransaction:
      return 'VerifyTransaction'
  }
}
