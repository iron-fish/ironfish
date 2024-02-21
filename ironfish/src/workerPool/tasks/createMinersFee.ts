/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset, generateKeyFromPrivateKey, Note, Transaction } from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { TransactionVersion } from '../../primitives/transaction'
import { BigIntUtils } from '../../utils'
import { WorkerMessage, WorkerMessageType } from './workerMessage'
import { WorkerTask } from './workerTask'

export class CreateMinersFeeRequest extends WorkerMessage {
  readonly amount: bigint
  readonly memo: Buffer
  readonly spendKey: string
  readonly transactionVersion: TransactionVersion

  constructor(
    amount: bigint,
    memo: Buffer,
    spendKey: string,
    transactionVersion: TransactionVersion,
    jobId?: number,
  ) {
    super(WorkerMessageType.CreateMinersFee, jobId)
    this.amount = amount
    this.memo = memo
    this.spendKey = spendKey
    this.transactionVersion = transactionVersion
  }

  serializePayload(bw: bufio.StaticWriter | bufio.BufferWriter): void {
    bw.writeVarBytes(BigIntUtils.toBytesBE(this.amount))
    bw.writeVarBytes(this.memo)
    bw.writeVarString(this.spendKey, 'utf8')
    bw.writeU8(this.transactionVersion)
  }

  static deserializePayload(jobId: number, buffer: Buffer): CreateMinersFeeRequest {
    const reader = bufio.read(buffer, true)
    const amount = BigIntUtils.fromBytesBE(reader.readVarBytes())
    const memo = reader.readVarBytes()
    const spendKey = reader.readVarString('utf8')
    const transactionVersion = reader.readU8()
    return new CreateMinersFeeRequest(amount, memo, spendKey, transactionVersion, jobId)
  }

  getSize(): number {
    return (
      bufio.sizeVarBytes(BigIntUtils.toBytesBE(this.amount)) +
      bufio.sizeVarBytes(this.memo) +
      bufio.sizeVarString(this.spendKey, 'utf8') +
      1 // transactionVersion
    )
  }
}

export class CreateMinersFeeResponse extends WorkerMessage {
  readonly serializedTransactionPosted: Uint8Array

  constructor(serializedTransactionPosted: Uint8Array, jobId: number) {
    super(WorkerMessageType.CreateMinersFee, jobId)
    this.serializedTransactionPosted = serializedTransactionPosted
  }

  serializePayload(bw: bufio.StaticWriter | bufio.BufferWriter): void {
    bw.writeBytes(Buffer.from(this.serializedTransactionPosted))
  }

  static deserializePayload(jobId: number, buffer: Buffer): CreateMinersFeeResponse {
    return new CreateMinersFeeResponse(Uint8Array.from(buffer), jobId)
  }

  getSize(): number {
    return this.serializedTransactionPosted.byteLength
  }
}

export class CreateMinersFeeTask extends WorkerTask {
  private static instance: CreateMinersFeeTask | undefined

  static getInstance(): CreateMinersFeeTask {
    if (!CreateMinersFeeTask.instance) {
      CreateMinersFeeTask.instance = new CreateMinersFeeTask()
    }
    return CreateMinersFeeTask.instance
  }

  execute({
    amount,
    memo,
    spendKey,
    transactionVersion,
    jobId,
  }: CreateMinersFeeRequest): CreateMinersFeeResponse {
    // Generate a public address from the miner's spending key
    const minerPublicAddress = generateKeyFromPrivateKey(spendKey).publicAddress
    const minerNote = new Note(
      minerPublicAddress,
      amount,
      memo,
      Asset.nativeId(),
      minerPublicAddress,
    )

    const transaction = new Transaction(transactionVersion)
    transaction.output(minerNote)

    const serializedTransactionPosted = transaction.post_miners_fee(spendKey)
    return new CreateMinersFeeResponse(serializedTransactionPosted, jobId)
  }
}
