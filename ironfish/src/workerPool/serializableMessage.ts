/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import bufio from 'bufio'
import { Serializable } from '../common/serializable'

export enum WorkerMessageType {
  BoxMessage = 'boxMessage',
  CreateMinersFee = 'createMinersFee',
  CreateTransaction = 'createTransaction',
  GetUnspentNotes = 'getUnspentNotes',
  MineHeader = 'mineHeader',
  Sleep = 'sleep',
  SubmitTelemetry = 'submitTelemetry',
  TransactionFee = 'transactionFee',
  UnboxMessage = 'unboxMessage',
  VerifyTransaction = 'verifyTransaction',
}

export abstract class SerializableWorkerMessage implements Serializable {
  constructor(id: number, type: WorkerMessageType) {
    this.id = id
    this.type = type
  }

  id: number

  type: WorkerMessageType

  abstract serialize(bw: bufio.BufferWriter): Buffer

  abstract deserialize(buffer: Buffer): Serializable

  abstract getSize(): number

  serializeWithMetadata(): Buffer {
    const bw = bufio.write()
    bw.writeU64(this.id)
    bw.writeVarString(this.type)
    bw.writeBytes(this.serialize(bw))
    return bw.render()
  }
}
