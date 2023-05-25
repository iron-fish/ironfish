/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import bufio from 'bufio'
import { Transaction } from '../../primitives'
import { RawTransaction, RawTransactionSerde } from '../../primitives/rawTransaction'
import { ACCOUNT_KEY_LENGTH } from '../../wallet'
import { WorkerMessage, WorkerMessageType } from './workerMessage'
import { WorkerTask } from './workerTask'

export class PostTransactionRequest extends WorkerMessage {
  readonly transaction: RawTransaction
  readonly spendingKey: string

  constructor(transaction: RawTransaction, spendingKey: string, jobId?: number) {
    super(WorkerMessageType.PostTransaction, jobId)
    this.transaction = transaction
    this.spendingKey = spendingKey
  }

  serializePayload(bw: bufio.StaticWriter | bufio.BufferWriter): void {
    bw.writeBytes(Buffer.from(this.spendingKey, 'hex'))
    bw.writeBytes(RawTransactionSerde.serialize(this.transaction))
  }

  static deserializePayload(jobId: number, buffer: Buffer): PostTransactionRequest {
    const reader = bufio.read(buffer, true)
    const spendingKey = reader.readBytes(ACCOUNT_KEY_LENGTH).toString('hex')
    const raw = RawTransactionSerde.deserialize(
      reader.readBytes(buffer.length - ACCOUNT_KEY_LENGTH),
    )
    return new PostTransactionRequest(raw, spendingKey, jobId)
  }

  getSize(): number {
    return RawTransactionSerde.getSize(this.transaction) + ACCOUNT_KEY_LENGTH
  }
}

export class PostTransactionResponse extends WorkerMessage {
  readonly transaction: Transaction

  constructor(transaction: Transaction, jobId: number) {
    super(WorkerMessageType.PostTransaction, jobId)
    this.transaction = transaction
  }

  serializePayload(bw: bufio.StaticWriter | bufio.BufferWriter): void {
    bw.writeVarBytes(this.transaction.serialize())
  }

  static deserializePayload(jobId: number, buffer: Buffer): PostTransactionResponse {
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
    const posted = request.transaction.post(request.spendingKey)
    return new PostTransactionResponse(posted, request.jobId)
  }
}
