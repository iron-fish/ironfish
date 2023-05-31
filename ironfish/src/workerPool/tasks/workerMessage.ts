/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import bufio from 'bufio'
import { Serializable } from '../../common/serializable'
import { WorkerHeader } from '../interfaces/workerHeader'

export const WORKER_MESSAGE_HEADER_SIZE = 9

export enum WorkerMessageType {
  CreateMinersFee = 0,
  DecryptNotes = 2,
  JobAborted = 3,
  JobError = 4,
  Sleep = 5,
  SubmitTelemetry = 6,
  VerifyTransaction = 7,
  VerifyTransactions = 8,
  PostTransaction = 9,
}

export abstract class WorkerMessage implements Serializable {
  private static id = 0

  jobId: number
  type: WorkerMessageType

  constructor(type: WorkerMessageType, jobId?: number) {
    this.jobId = jobId ?? WorkerMessage.id++
    this.type = type
  }

  abstract serializePayload(bw: bufio.StaticWriter | bufio.BufferWriter): void
  abstract getSize(): number

  static deserializeHeader(buffer: Buffer): WorkerHeader {
    const br = bufio.read(buffer, true)
    const jobId = Number(br.readU64())
    const type = br.readU8()
    // TODO(mat): can we utilize zero copy here?
    return {
      jobId,
      type,
      body: br.readBytes(br.left(), true),
    }
  }

  serialize(): Buffer {
    const bw = bufio.pool(WORKER_MESSAGE_HEADER_SIZE + this.getSize())
    bw.writeU64(this.jobId)
    bw.writeU8(this.type)
    this.serializePayload(bw)
    return bw.render()
  }
}
