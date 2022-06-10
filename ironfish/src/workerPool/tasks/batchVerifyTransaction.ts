/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { batchVerify } from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { WorkerMessage, WorkerMessageType } from './workerMessage'
import { WorkerTask } from './workerTask'

export class BatchVerifyTransactionRequest extends WorkerMessage {
  readonly transactionsPosted: Buffer[]

  constructor(transactionsPosted: Buffer[], jobId?: number) {
    super(WorkerMessageType.BatchVerifyTransaction, jobId)
    this.transactionsPosted = transactionsPosted
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    bw.writeU64(this.transactionsPosted.length)
    for (const tx of this.transactionsPosted) {
      bw.writeU64(tx.length)
      bw.writeBytes(tx)
    }
    return bw.render()
  }

  static deserialize(jobId: number, buffer: Buffer): BatchVerifyTransactionRequest {
    const reader = bufio.read(buffer, true)

    const txLength = reader.readU64()
    const transactionsPosted = []
    for (let i = 0; i < txLength; i++) {
      const l = reader.readU64()
      const tx = reader.readBytes(l)
      transactionsPosted.push(tx)
    }
    return new BatchVerifyTransactionRequest(transactionsPosted, jobId)
  }

  getSize(): number {
    let size = 8
    size += 8 * this.transactionsPosted.length
    for (const tx of this.transactionsPosted) {
      size += tx.length
    }
    return size
  }
}

export class BatchVerifyTransactionResponse extends WorkerMessage {
  readonly verified: boolean

  constructor(verified: boolean, jobId: number) {
    super(WorkerMessageType.BatchVerifyTransaction, jobId)
    this.verified = verified
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    bw.writeU8(Number(this.verified))
    return bw.render()
  }

  static deserialize(jobId: number, buffer: Buffer): BatchVerifyTransactionResponse {
    const reader = bufio.read(buffer, true)
    const verified = Boolean(reader.readU8())
    return new BatchVerifyTransactionResponse(verified, jobId)
  }

  getSize(): number {
    return 1
  }
}

export class BatchVerifyTransactionTask extends WorkerTask {
  private static instance: BatchVerifyTransactionTask | undefined

  static getInstance(): BatchVerifyTransactionTask {
    if (!BatchVerifyTransactionTask.instance) {
      BatchVerifyTransactionTask.instance = new BatchVerifyTransactionTask()
    }
    return BatchVerifyTransactionTask.instance
  }

  execute({
    jobId,
    transactionsPosted,
  }: BatchVerifyTransactionRequest): BatchVerifyTransactionResponse {
    let verified = false

    try {
      verified = batchVerify(transactionsPosted)
    } catch (e) {
      verified = false
    }

    return new BatchVerifyTransactionResponse(verified, jobId)
  }
}
