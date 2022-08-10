/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import bufio from 'bufio'
import { Serializable } from '../../common/serializable'

export enum WorkerMessageType {
  BoxMessage = 0,
  CreateMinersFee = 1,
  CreateTransaction = 2,
  DecryptNotes = 3,
  GetUnspentNotes = 4,
  JobAborted = 5,
  JobError = 6,
  Sleep = 7,
  SubmitTelemetry = 8,
  UnboxMessage = 9,
  VerifyTransaction = 10,
  VerifyTransactions = 11,
}

export abstract class WorkerMessage implements Serializable {
  private static id = 0

  jobId: number
  type: WorkerMessageType

  constructor(type: WorkerMessageType, jobId?: number) {
    this.jobId = jobId ?? WorkerMessage.id++
    this.type = type
  }

  abstract serialize(): Buffer
  abstract getSize(): number

  serializeWithMetadata(): Buffer {
    const headerSize = 9
    const bw = bufio.write(headerSize + this.getSize())
    bw.writeU64(this.jobId)
    bw.writeU8(this.type)
    bw.writeBytes(this.serialize())
    return bw.render()
  }
}
