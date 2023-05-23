/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { Job } from '../job'
import bufio from 'bufio'
import { PromiseUtils } from '../../utils'
import { WorkerMessage, WorkerMessageType } from './workerMessage'
import { WorkerTask } from './workerTask'

export class SleepRequest extends WorkerMessage {
  readonly sleep: number
  readonly error: string

  constructor(sleep: number, error: string, jobId?: number) {
    super(WorkerMessageType.Sleep, jobId)
    this.sleep = sleep
    this.error = error
  }

  serializePayload(bw: bufio.StaticWriter | bufio.BufferWriter): void {
    bw.writeDouble(this.sleep)
    bw.writeVarString(this.error, 'utf8')
  }

  static deserializePayload(jobId: number, buffer: Buffer): SleepRequest {
    const reader = bufio.read(buffer, true)
    const sleep = reader.readDouble()
    const error = reader.readVarString('utf8')
    return new SleepRequest(sleep, error, jobId)
  }

  getSize(): number {
    return 8 + bufio.sizeVarString(this.error, 'utf8')
  }
}

export class SleepResponse extends WorkerMessage {
  readonly aborted: boolean

  constructor(aborted: boolean, jobId: number) {
    super(WorkerMessageType.Sleep, jobId)
    this.aborted = aborted
  }

  serializePayload(bw: bufio.StaticWriter | bufio.BufferWriter): void {
    bw.writeU8(Number(this.aborted))
  }

  static deserializePayload(jobId: number, buffer: Buffer): SleepResponse {
    const reader = bufio.read(buffer, true)
    const aborted = Boolean(reader.readU8())
    return new SleepResponse(aborted, jobId)
  }

  getSize(): number {
    return 1
  }
}

export class SleepTask extends WorkerTask {
  private static instance: SleepTask | undefined

  static getInstance(): SleepTask {
    if (!SleepTask.instance) {
      SleepTask.instance = new SleepTask()
    }
    return SleepTask.instance
  }

  async execute({ jobId, sleep, error }: SleepRequest, job: Job): Promise<SleepResponse> {
    await PromiseUtils.sleep(sleep)

    if (error) {
      throw new Error(error)
    }

    if (job.status === 'aborted') {
      return new SleepResponse(true, jobId)
    }

    return new SleepResponse(false, jobId)
  }
}
