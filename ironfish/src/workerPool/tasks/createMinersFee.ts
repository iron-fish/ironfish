/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset, generateKeyFromPrivateKey, Note, Transaction } from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { BigIntUtils } from '../../utils'
import { ACCOUNT_KEY_LENGTH } from '../../wallet'
import { WorkerMessage, WorkerMessageType } from './workerMessage'
import { WorkerTask } from './workerTask'

export class CreateMinersFeeRequest extends WorkerMessage {
  readonly amount: bigint
  readonly memo: string
  readonly spendKey: Buffer

  constructor(amount: bigint, memo: string, spendKey: Buffer, jobId?: number) {
    super(WorkerMessageType.CreateMinersFee, jobId)
    this.amount = amount
    this.memo = memo
    this.spendKey = spendKey
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    bw.writeVarBytes(BigIntUtils.toBytesBE(this.amount))
    bw.writeVarString(this.memo, 'utf8')
    bw.writeBytes(this.spendKey)
    return bw.render()
  }

  static deserialize(jobId: number, buffer: Buffer): CreateMinersFeeRequest {
    const reader = bufio.read(buffer, true)
    const amount = BigIntUtils.fromBytesBE(reader.readVarBytes())
    const memo = reader.readVarString('utf8')
    const spendKey = reader.readBytes(ACCOUNT_KEY_LENGTH)
    return new CreateMinersFeeRequest(amount, memo, spendKey, jobId)
  }

  getSize(): number {
    return (
      bufio.sizeVarBytes(BigIntUtils.toBytesBE(this.amount)) +
      bufio.sizeVarString(this.memo, 'utf8') +
      ACCOUNT_KEY_LENGTH
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
    const minerPublicAddress = generateKeyFromPrivateKey(spendKey).publicAddress
    const minerNote = new Note(
      minerPublicAddress,
      amount,
      memo,
      Asset.nativeId(),
      minerPublicAddress,
    )

    const transaction = new Transaction(spendKey)
    transaction.output(minerNote)

    const serializedTransactionPosted = transaction.post_miners_fee()
    return new CreateMinersFeeResponse(serializedTransactionPosted, jobId)
  }
}
