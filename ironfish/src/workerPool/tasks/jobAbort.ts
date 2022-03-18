/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { WorkerMessage, WorkerMessageType } from './workerMessage'

export class JobAbortedMessage extends WorkerMessage {
  constructor(jobId?: number) {
    super(WorkerMessageType.JobAborted, jobId)
  }

  serialize(): Buffer {
    return Buffer.from('')
  }

  static deserialize(): JobAbortedError {
    return new JobAbortedError()
  }

  getSize(): number {
    return 0
  }
}

export class JobAbortedError extends Error {
  type = 'JobAbortedError'

  constructor() {
    super()
    this.name = 'JobAbortedError'
  }
}
