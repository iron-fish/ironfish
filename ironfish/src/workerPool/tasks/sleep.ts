/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { PromiseUtils } from '../../utils'
import { Job } from '../job'
import { WorkerMessageType } from '../messages'
import bufio from 'bufio'

const SLEEP_BYTE_LENGTH = 8

export type SleepRequest = {
  type: WorkerMessageType.sleep
  sleep: number
  error: string
}

export type SleepResponse = {
  aborted: boolean
}

export class SleepReq {
  readonly br: bufio.BufferReader
  readonly bufferLength: number

  constructor(requestBody: Buffer) {
    this.br = bufio.read(requestBody)
    this.bufferLength = requestBody.length
  }

  static serialize(options: SleepRequest): Buffer {
    const bw = bufio.write()
    bw.writeU64(options.sleep)
    bw.writeBytes(Buffer.from(options.error))
    return bw.render()
  }

  sleep(): number {
    this.br.offset = 0
    return this.br.readU64()
  }

  error(): string {
    this.br.offset = SLEEP_BYTE_LENGTH
    const errorLength = this.bufferLength - this.br.offset
    return this.br.readBytes(errorLength).toString()
  }
}

export class SleepResp {
  readonly br: bufio.BufferReader

  constructor(responseBody: Buffer) {
    this.br = bufio.read(responseBody)
  }

  static serialize(options: SleepResponse): Buffer {
    const bw = bufio.write()
    bw.writeU32(options.aborted ? 1 : 0)
    return bw.render()
  }

  deserialize(): SleepResponse {
    const aborted = Boolean(this.br.readU32())

    return { aborted }
  }

  aborted(): boolean {
    this.br.offset = 0
    return Boolean(this.br.readU32())
  }
}

export async function handleSleep(
  requestBody: Buffer,
  job: Job,
): Promise<{ responseType: WorkerMessageType; response: Buffer }> {
  const request = new SleepReq(requestBody)
  await PromiseUtils.sleep(request.sleep())

  if (request.error()) {
    throw new Error(request.error())
  }

  if (job.status === 'aborted') {
    return {
      responseType: WorkerMessageType.sleep,
      response: SleepResp.serialize({ aborted: true }),
    }
  }

  return {
    responseType: WorkerMessageType.sleep,
    response: SleepResp.serialize({ aborted: false }),
  }
}
