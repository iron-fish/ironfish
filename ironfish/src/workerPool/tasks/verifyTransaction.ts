/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { TransactionPosted } from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { WorkerMessage, WorkerMessageType } from './workerMessage'
import { WorkerTask } from './workerTask'

export interface VerifyTransactionOptions {
  verifyFees?: boolean
}

export class VerifyTransactionRequest extends WorkerMessage {
  readonly transactionPosted: Buffer
  readonly verifyFees: boolean

  constructor(transactionPosted: Buffer, options?: VerifyTransactionOptions, jobId?: number) {
    super(WorkerMessageType.VerifyTransaction, jobId)
    this.transactionPosted = transactionPosted
    this.verifyFees = options?.verifyFees ?? true
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    bw.writeVarBytes(this.transactionPosted)
    bw.writeU8(Number(this.verifyFees))
    return bw.render()
  }

  static deserialize(jobId: number, buffer: Buffer): VerifyTransactionRequest {
    const reader = bufio.read(buffer, true)
    const transactionPosted = reader.readVarBytes()
    const verifyFees = Boolean(reader.readU8())
    return new VerifyTransactionRequest(transactionPosted, { verifyFees }, jobId)
  }

  getSize(): number {
    return bufio.sizeVarBytes(this.transactionPosted) + 1
  }
}

export class VerifyTransactionResponse extends WorkerMessage {
  readonly verified: boolean

  constructor(verified: boolean, jobId: number) {
    super(WorkerMessageType.VerifyTransaction, jobId)
    this.verified = verified
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    bw.writeU8(Number(this.verified))
    return bw.render()
  }

  static deserialize(jobId: number, buffer: Buffer): VerifyTransactionResponse {
    const reader = bufio.read(buffer, true)
    const verified = Boolean(reader.readU8())
    return new VerifyTransactionResponse(verified, jobId)
  }

  getSize(): number {
    return 1
  }
}

export class VerifyTransactionTask extends WorkerTask {
  private static instance: VerifyTransactionTask | undefined

  static getInstance(): VerifyTransactionTask {
    if (!VerifyTransactionTask.instance) {
      VerifyTransactionTask.instance = new VerifyTransactionTask()
    }
    return VerifyTransactionTask.instance
  }

  execute({
    jobId,
    transactionPosted,
    verifyFees,
  }: VerifyTransactionRequest): VerifyTransactionResponse {
    let transaction
    let verified = false

    try {
      transaction = new TransactionPosted(transactionPosted)

      if (verifyFees && transaction.fee() < BigInt(0)) {
        throw new Error('Transaction has negative fees')
      }

      verified = transaction.verify()
    } catch {
      verified = false
    }

    return new VerifyTransactionResponse(verified, jobId)
  }
}
