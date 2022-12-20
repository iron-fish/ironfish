/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import bufio from 'bufio'
import { Transaction } from '../../primitives'
import { RawTransaction, RawTransactionSerde } from '../../primitives/rawTransaction'
import { WorkerMessage, WorkerMessageType } from './workerMessage'
import { WorkerTask } from './workerTask'

export class PostTransactionRequest extends WorkerMessage {
  readonly transaction: RawTransaction

  constructor(transaction: RawTransaction, jobId?: number) {
    super(WorkerMessageType.PostTransaction, jobId)
    this.transaction = transaction
  }

  serialize(): Buffer {
    return RawTransactionSerde.serialize(this.transaction)
  }

  static deserialize(jobId: number, buffer: Buffer): PostTransactionRequest {
    const raw = RawTransactionSerde.deserialize(buffer)
    return new PostTransactionRequest(raw, jobId)
  }

  getSize(): number {
    return RawTransactionSerde.getSize(this.transaction)
  }
}

export class PostTransactionResponse extends WorkerMessage {
  readonly transaction: Transaction

  constructor(transaction: Transaction, jobId: number) {
    super(WorkerMessageType.PostTransaction, jobId)
    this.transaction = transaction
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    bw.writeVarBytes(this.transaction.serialize())
    return bw.render()
  }

  static deserialize(jobId: number, buffer: Buffer): PostTransactionResponse {
    const reader = bufio.read(buffer, true)
    const transaction = new Transaction(reader.readVarBytes())
    return new PostTransactionResponse(transaction, jobId)
  }

  getSize(): number {
    return bufio.sizeVarBytes(this.transaction.serialize())
  }
}

export class PostTransactionTask extends WorkerTask {
  private static instance: PostTransactionTask | undefined

  static getInstance(): PostTransactionTask {
    if (!PostTransactionTask.instance) {
      PostTransactionTask.instance = new PostTransactionTask()
    }

    return PostTransactionTask.instance
  }

  execute(request: PostTransactionRequest): PostTransactionResponse {
    const posted = request.transaction.post()
    return new PostTransactionResponse(posted, request.jobId)
  }
}
