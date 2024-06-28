/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { WorkerMessage, WorkerMessageType } from './workerMessage'

export class JobAbortedMessage extends WorkerMessage {
  constructor(jobId?: number) {
    super(WorkerMessageType.JobAborted, jobId)
  }

  serializePayload(): void {
    return
  }

  static deserializePayload(): JobAbortedMessage {
    return new JobAbortedMessage()
  }

  getSize(): number {
    return 0
  }
}

export class JobAbortedError extends Error {
  name = this.constructor.name
  type = 'JobAbortedError'

  constructor() {
    super()
    this.name = 'JobAbortedError'
  }
}
