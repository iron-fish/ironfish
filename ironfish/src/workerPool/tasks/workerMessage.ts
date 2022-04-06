/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import bufio from 'bufio'
import { Serializable } from '../../common/serializable'

export enum WorkerMessageType {
  BoxMessage = 0,
  CreateMinersFee = 1,
  CreateTransaction = 2,
  GetUnspentNotes = 3,
  JobAborted = 4,
  JobError = 5,
  Sleep = 6,
  SubmitTelemetry = 7,
  TransactionFee = 8,
  UnboxMessage = 9,
  VerifyTransaction = 10,
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
    const headerSize = 17
    const bw = bufio.write(headerSize + this.getSize())
    bw.writeU64(this.jobId)
    bw.writeU8(this.type)
    bw.writeU64(this.getSize())
    bw.writeBytes(this.serialize())
    return bw.render()
  }
}
