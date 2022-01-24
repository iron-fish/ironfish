import { WorkerMessageType } from '../messages'
import { JobErrorSerialized } from '../errors'
import bufio from 'bufio'

export type JobAbortRequest = {
  type: WorkerMessageType.jobAbort
}

export type JobErrorResponse = {
  type: WorkerMessageType.jobError
  error: JobErrorSerialized
}

export class JobAbortReq {
  readonly br: bufio.BufferReader

  constructor(requestBody: Buffer) {
    this.br = bufio.read(requestBody)
  }

  static serialize(options: JobAbortRequest): Buffer {
    const bw = bufio.write()
    return bw.render()
  }
}

export class JobErrorResp {
  readonly br: bufio.BufferReader

  constructor(responseBody: Buffer) {
    this.br = bufio.read(responseBody)
  }

  static serialize(options: JobErrorResponse): Buffer {
    const bw = bufio.write()
    bw.writeVarString(options.error.type)
    bw.writeVarString(options.error.message)

    if (options.error.stack) {
      bw.writeVarString(options.error.stack)
    }

    if (options.error.code) {
      bw.writeVarString(options.error.code)
    }

    return bw.render()
  }

  deserialize(): JobErrorResponse {
    const errorType = this.br.readVarString()
    const message = this.br.readVarString()
    const stack = this.br.readVarString()
    const code = this.br.readVarString()

    const error: JobErrorSerialized = { type: errorType, message, stack, code }
    return { type: WorkerMessageType.jobError, error }
  }
}
