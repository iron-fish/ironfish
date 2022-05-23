/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { batchVerify, TransactionPosted } from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { WorkerMessage, WorkerMessageType } from './workerMessage'
import { WorkerTask } from './workerTask'

export interface VerifyBlockOptions {
  verifyFees?: boolean
}

export class VerifyBlockRequest extends WorkerMessage {
  readonly transactionsPosted: Buffer[]
  // readonly verifyFees: boolean

  // constructor(transactionsPosted: Buffer[], options?: VerifyBlockOptions, jobId?: number) {
  constructor(transactionsPosted: Buffer[], jobId?: number) {
    super(WorkerMessageType.VerifyBlock, jobId)
    this.transactionsPosted = transactionsPosted
    // this.verifyFees = options?.verifyFees ?? true
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    // bw.writeVarBytes(this.transactionsPosted)
    // bw.writeU8(Number(this.verifyFees))
    bw.writeU64(this.transactionsPosted.length)
    for (const tx of this.transactionsPosted) {
      bw.writeU64(tx.length)
      bw.writeBytes(tx)
    }
    return bw.render()
  }

  static deserialize(jobId: number, buffer: Buffer): VerifyBlockRequest {
    const reader = bufio.read(buffer, true)
    // const transactionPosted = reader.readVarBytes()
    // const verifyFees = Boolean(reader.readU8())

    const txLength = reader.readU64()
    const transactionsPosted = []
    for (let i = 0; i < txLength; i++) {
      const l = reader.readU64()
      const tx = reader.readBytes(l)
      transactionsPosted.push(tx)
    }
    return new VerifyBlockRequest(transactionsPosted, jobId)
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

export class VerifyBlockResponse extends WorkerMessage {
  readonly verified: boolean

  constructor(verified: boolean, jobId: number) {
    super(WorkerMessageType.VerifyBlock, jobId)
    this.verified = verified
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    bw.writeU8(Number(this.verified))
    return bw.render()
  }

  static deserialize(jobId: number, buffer: Buffer): VerifyBlockResponse {
    const reader = bufio.read(buffer, true)
    const verified = Boolean(reader.readU8())
    return new VerifyBlockResponse(verified, jobId)
  }

  getSize(): number {
    return 1
  }
}

export class VerifyBlockTask extends WorkerTask {
  private static instance: VerifyBlockTask | undefined

  static getInstance(): VerifyBlockTask {
    if (!VerifyBlockTask.instance) {
      VerifyBlockTask.instance = new VerifyBlockTask()
    }
    return VerifyBlockTask.instance
  }

  execute({ jobId, transactionsPosted }: VerifyBlockRequest): VerifyBlockResponse {
    let verified = false

    try {
      verified = batchVerify(transactionsPosted)
    } catch (e) {
      verified = false
    }

    return new VerifyBlockResponse(verified, jobId)
  }
}
