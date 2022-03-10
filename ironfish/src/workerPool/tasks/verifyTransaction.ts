/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { TransactionPosted } from 'ironfish-rust-nodejs'
import { WorkerMessage, WorkerMessageType } from './workerMessage'
import { WorkerTask } from './workerTask'
import bufio from 'bufio'

interface VerifyTransactionOptions {
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
    bw.writeBytes(this.transactionPosted)
    bw.writeU8(Number(this.verifyFees))
    return bw.render()
  }

  static deserialize(jobId: number, buffer: Buffer): VerifyTransactionRequest {
    const reader = bufio.read(buffer, true)
    const json = reader.readVarString('utf8')
    return new VerifyTransactionRequest(points, jobId)
  }

  getSize(): number {
    return this.transactionPosted.byteLength + 1
  }
}

export class VerifyTransactionResponse extends WorkerMessage {
  private readonly verified: boolean

  constructor(verified: boolean, jobId: number) {
    super(WorkerMessageType.VerifyTransaction, jobId)
    this.verified = verified
  }

  serialize(): Buffer {
    return Buffer.from('')
  }

  static deserialize(jobId: number, buffer: Buffer): VerifyTransactionResponse {
    return new VerifyTransactionResponse(jobId)
  }

  getSize(): number {
    return 0
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

  async execute({ jobId, transactionPosted, verifyFees }: VerifyTransactionRequest): Promise<VerifyTransactionResponse> {
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
