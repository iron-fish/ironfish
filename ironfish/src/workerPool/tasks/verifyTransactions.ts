/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { verifyTransactions } from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { WorkerMessage, WorkerMessageType } from './workerMessage'
import { WorkerTask } from './workerTask'

export class VerifyTransactionsRequest extends WorkerMessage {
  readonly transactionsPosted: Buffer[]

  constructor(transactionsPosted: Buffer[], jobId?: number) {
    super(WorkerMessageType.VerifyTransactions, jobId)
    this.transactionsPosted = transactionsPosted
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    bw.writeU64(this.transactionsPosted.length)
    for (const tx of this.transactionsPosted) {
      bw.writeVarBytes(tx)
    }
    return bw.render()
  }

  static deserialize(jobId: number, buffer: Buffer): VerifyTransactionsRequest {
    const reader = bufio.read(buffer, true)

    const txLength = reader.readU64()
    const transactionsPosted = []
    for (let i = 0; i < txLength; i++) {
      const tx = reader.readVarBytes()
      transactionsPosted.push(tx)
    }
    return new VerifyTransactionsRequest(transactionsPosted, jobId)
  }

  getSize(): number {
    let size = 8
    for (const tx of this.transactionsPosted) {
      size += bufio.sizeVarBytes(tx)
    }
    return size
  }
}

export class VerifyTransactionsResponse extends WorkerMessage {
  readonly verified: boolean

  constructor(verified: boolean, jobId: number) {
    super(WorkerMessageType.VerifyTransactions, jobId)
    this.verified = verified
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    bw.writeU8(Number(this.verified))
    return bw.render()
  }

  static deserialize(jobId: number, buffer: Buffer): VerifyTransactionsResponse {
    const reader = bufio.read(buffer, true)
    const verified = Boolean(reader.readU8())
    return new VerifyTransactionsResponse(verified, jobId)
  }

  getSize(): number {
    return 1
  }
}

export class VerifyTransactionsTask extends WorkerTask {
  private static instance: VerifyTransactionsTask | undefined

  static getInstance(): VerifyTransactionsTask {
    if (!VerifyTransactionsTask.instance) {
      VerifyTransactionsTask.instance = new VerifyTransactionsTask()
    }
    return VerifyTransactionsTask.instance
  }

  execute({
    jobId,
    transactionsPosted,
  }: VerifyTransactionsRequest): VerifyTransactionsResponse {
    let verified = false

    try {
      verified = verifyTransactions(transactionsPosted)
    } catch (e) {
      verified = false
    }

    return new VerifyTransactionsResponse(verified, jobId)
  }
}
