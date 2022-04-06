/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { TransactionPosted } from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { BigIntUtils } from '../../utils'
import { WorkerMessage, WorkerMessageType } from './workerMessage'
import { WorkerTask } from './workerTask'

export class TransactionFeeRequest extends WorkerMessage {
  readonly serializedTransactionPosted: Buffer

  constructor(serializedTransactionPosted: Buffer, jobId?: number) {
    super(WorkerMessageType.TransactionFee, jobId)
    this.serializedTransactionPosted = serializedTransactionPosted
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    bw.writeVarBytes(this.serializedTransactionPosted)
    return bw.render()
  }

  static deserialize(jobId: number, buffer: Buffer): TransactionFeeRequest {
    const reader = bufio.read(buffer, true)
    const serializedTransactionPosted = reader.readVarBytes()
    return new TransactionFeeRequest(serializedTransactionPosted, jobId)
  }

  getSize(): number {
    return bufio.sizeVarBytes(this.serializedTransactionPosted)
  }
}

export class TransactionFeeResponse extends WorkerMessage {
  readonly fee: bigint

  constructor(fee: bigint, jobId: number) {
    super(WorkerMessageType.TransactionFee, jobId)
    this.fee = fee
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    bw.writeVarBytes(BigIntUtils.toBytes(this.fee))
    bw.writeU8(Number(this.fee < BigInt(-1)))
    return bw.render()
  }

  static deserialize(jobId: number, buffer: Buffer): TransactionFeeResponse {
    const reader = bufio.read(buffer, true)
    const feeAmount = BigIntUtils.fromBytes(reader.readVarBytes())
    const negative = reader.readU8()
    const fee = negative ? BigInt(-1) * feeAmount : feeAmount
    return new TransactionFeeResponse(fee, jobId)
  }

  getSize(): number {
    return bufio.sizeVarBytes(BigIntUtils.toBytes(this.fee)) + 1
  }
}

export class TransactionFeeTask extends WorkerTask {
  private static instance: TransactionFeeTask | undefined

  static getInstance(): TransactionFeeTask {
    if (!TransactionFeeTask.instance) {
      TransactionFeeTask.instance = new TransactionFeeTask()
    }
    return TransactionFeeTask.instance
  }

  execute({
    jobId,
    serializedTransactionPosted,
  }: TransactionFeeRequest): TransactionFeeResponse {
    const transaction = new TransactionPosted(serializedTransactionPosted)
    const fee = transaction.fee()
    return new TransactionFeeResponse(fee, jobId)
  }
}
