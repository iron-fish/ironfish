/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { generateNewPublicAddress, Note, Transaction } from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { BigIntUtils } from '../../utils'
import { WorkerMessage, WorkerMessageType } from './workerMessage'
import { WorkerTask } from './workerTask'

export class CreateMinersFeeRequest extends WorkerMessage {
  readonly amount: bigint
  readonly memo: string
  readonly spendKey: string

  constructor(amount: bigint, memo: string, spendKey: string, jobId?: number) {
    super(WorkerMessageType.CreateMinersFee, jobId)
    this.amount = amount
    this.memo = memo
    this.spendKey = spendKey
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    bw.writeVarBytes(BigIntUtils.toBytes(this.amount))
    bw.writeVarString(this.memo, 'utf8')
    bw.writeVarString(this.spendKey, 'utf8')
    return bw.render()
  }

  static deserialize(jobId: number, buffer: Buffer): CreateMinersFeeRequest {
    const reader = bufio.read(buffer, true)
    const amount = BigIntUtils.fromBytes(reader.readVarBytes())
    const memo = reader.readVarString('utf8')
    const spendKey = reader.readVarString('utf8')
    return new CreateMinersFeeRequest(amount, memo, spendKey, jobId)
  }

  getSize(): number {
    return (
      bufio.sizeVarBytes(BigIntUtils.toBytes(this.amount)) +
      bufio.sizeVarString(this.memo, 'utf8') +
      bufio.sizeVarString(this.spendKey, 'utf8')
    )
  }
}

export class CreateMinersFeeResponse extends WorkerMessage {
  readonly serializedTransactionPosted: Uint8Array

  constructor(serializedTransactionPosted: Uint8Array, jobId: number) {
    super(WorkerMessageType.CreateMinersFee, jobId)
    this.serializedTransactionPosted = serializedTransactionPosted
  }

  serialize(): Buffer {
    return Buffer.from(this.serializedTransactionPosted)
  }

  static deserialize(jobId: number, buffer: Buffer): CreateMinersFeeResponse {
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

  execute({ amount, memo, spendKey, jobId }: CreateMinersFeeRequest): CreateMinersFeeResponse {
    // Generate a public address from the miner's spending key
    const minerPublicAddress = generateNewPublicAddress(spendKey).public_address
    const minerNote = new Note(minerPublicAddress, amount, memo)

    const transaction = new Transaction()
    transaction.receive(spendKey, minerNote)

    const serializedTransactionPosted = transaction.post_miners_fee()
    return new CreateMinersFeeResponse(serializedTransactionPosted, jobId)
  }
}
