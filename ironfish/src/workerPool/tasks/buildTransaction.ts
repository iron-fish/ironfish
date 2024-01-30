/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { UnsignedTransaction } from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { RawTransaction, RawTransactionSerde } from '../../primitives/rawTransaction'
import { ACCOUNT_KEY_LENGTH } from '../../wallet'
import { VIEW_KEY_LENGTH } from '../../wallet/walletdb/accountValue'
import { WorkerMessage, WorkerMessageType } from './workerMessage'
import { WorkerTask } from './workerTask'

export class BuildTransactionRequest extends WorkerMessage {
  readonly transaction: RawTransaction
  readonly proofGenerationKey: string
  readonly viewKey: string
  readonly outgoingViewKey: string

  constructor(
    transaction: RawTransaction,
    proofGenerationKey: string,
    viewKey: string,
    outgoingViewKey: string,
    jobId?: number,
  ) {
    super(WorkerMessageType.BuildTransaction, jobId)
    this.transaction = transaction
    this.proofGenerationKey = proofGenerationKey
    this.viewKey = viewKey
    this.outgoingViewKey = outgoingViewKey
  }

  serializePayload(bw: bufio.StaticWriter | bufio.BufferWriter): void {
    bw.writeBytes(Buffer.from(this.proofGenerationKey, 'hex'))
    bw.writeBytes(Buffer.from(this.viewKey, 'hex'))
    bw.writeBytes(Buffer.from(this.outgoingViewKey, 'hex'))
    bw.writeBytes(RawTransactionSerde.serialize(this.transaction))
  }

  static deserializePayload(jobId: number, buffer: Buffer): BuildTransactionRequest {
    const reader = bufio.read(buffer, true)
    const proofGenerationKey = reader.readBytes(VIEW_KEY_LENGTH).toString('hex')
    const viewKey = reader.readBytes(VIEW_KEY_LENGTH).toString('hex')
    const outgoingViewKeyiewKey = reader.readBytes(ACCOUNT_KEY_LENGTH).toString('hex')
    const raw = RawTransactionSerde.deserialize(
      reader.readBytes(
        buffer.length - (VIEW_KEY_LENGTH + VIEW_KEY_LENGTH + ACCOUNT_KEY_LENGTH),
      ),
    )
    return new BuildTransactionRequest(
      raw,
      proofGenerationKey,
      viewKey,
      outgoingViewKeyiewKey,
      jobId,
    )
  }

  getSize(): number {
    return (
      RawTransactionSerde.getSize(this.transaction) + // rawTransaction
      VIEW_KEY_LENGTH + // proofGenerationKey
      VIEW_KEY_LENGTH + // viewKey
      ACCOUNT_KEY_LENGTH // outgoingViewKey
    )
  }
}

export class BuildTransactionResponse extends WorkerMessage {
  readonly transaction: UnsignedTransaction

  constructor(transaction: UnsignedTransaction, jobId: number) {
    super(WorkerMessageType.BuildTransaction, jobId)
    this.transaction = transaction
  }

  serializePayload(bw: bufio.StaticWriter | bufio.BufferWriter): void {
    bw.writeVarBytes(this.transaction.serialize())
  }

  static deserializePayload(jobId: number, buffer: Buffer): BuildTransactionResponse {
    const reader = bufio.read(buffer, true)
    const transaction = new UnsignedTransaction(reader.readVarBytes())
    return new BuildTransactionResponse(transaction, jobId)
  }

  getSize(): number {
    return bufio.sizeVarBytes(this.transaction.serialize())
  }
}

export class BuildTransactionTask extends WorkerTask {
  private static instance: BuildTransactionTask | undefined

  static getInstance(): BuildTransactionTask {
    if (!BuildTransactionTask.instance) {
      BuildTransactionTask.instance = new BuildTransactionTask()
    }

    return BuildTransactionTask.instance
  }

  execute(request: BuildTransactionRequest): BuildTransactionResponse {
    const unsigned = request.transaction.build(
      request.proofGenerationKey,
      request.viewKey,
      request.outgoingViewKey,
    )
    return new BuildTransactionResponse(unsigned, request.jobId)
  }
}
