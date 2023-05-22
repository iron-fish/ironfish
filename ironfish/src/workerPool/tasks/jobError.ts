/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { ErrorUtils } from '../../utils'
import { WorkerMessage, WorkerMessageType } from './workerMessage'

export class JobErrorMessage extends WorkerMessage {
  errorType = 'JobError'
  code: string | undefined
  stack: string | undefined
  message = ''

  constructor(jobId?: number, error?: unknown) {
    super(WorkerMessageType.JobError, jobId)

    if (error) {
      this.errorType =
        typeof error === 'object' ? error?.constructor.name ?? typeof error : 'unknown'

      this.code = undefined
      this.stack = undefined
      this.message = ErrorUtils.renderError(error)

      if (error instanceof Error) {
        this.code = error.name
        this.stack = error.stack

        if (ErrorUtils.isNodeError(error)) {
          this.code = error.code
        }
      }
    }
  }

  serializePayload(bw: bufio.StaticWriter | bufio.BufferWriter): void {
    bw.writeVarString(this.errorType, 'utf8')
    bw.writeVarString(this.message, 'utf8')
    if (this.code) {
      bw.writeVarString(this.code, 'utf8')
    }
    if (this.stack) {
      bw.writeVarString(this.stack, 'utf8')
    }
  }

  // We return JobError so the error can be propagated to a calling Promise's reject method
  static deserializePayload(jobId: number, buffer: Buffer): JobError {
    const br = bufio.read(buffer, true)

    const errorType = br.readVarString('utf8')
    const message = br.readVarString('utf8')

    let stack = undefined
    let code = undefined

    try {
      code = br.readVarString('utf8')
    } catch {
      code = undefined
    }

    try {
      stack = br.readVarString('utf8')
    } catch {
      stack = undefined
    }

    const err = new JobErrorMessage(jobId)
    err.errorType = errorType
    err.message = message
    err.code = code
    err.stack = stack

    return new JobError(err)
  }

  getSize(): number {
    const errorTypeSize = bufio.sizeVarString(this.errorType, 'utf8')
    const messageSize = bufio.sizeVarString(this.message, 'utf8')
    const codeSize = this.code ? bufio.sizeVarString(this.code, 'utf8') : 0
    const stackSize = this.stack ? bufio.sizeVarString(this.stack, 'utf8') : 0
    return errorTypeSize + messageSize + codeSize + stackSize
  }
}

export class JobError extends Error {
  name = this.constructor.name
  type = 'JobError'
  code: string | undefined = undefined

  constructor(jobErrorMessage?: JobErrorMessage) {
    super()

    if (jobErrorMessage) {
      this.code = jobErrorMessage.code
      this.stack = jobErrorMessage.stack
      this.message = jobErrorMessage.message
      this.type = jobErrorMessage.errorType
    }
  }
}
