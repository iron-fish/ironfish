/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { TransactionPosted } from 'ironfish-rust-nodejs'
import { WorkerMessageType } from '../messages'
import bufio from 'bufio'
import { BigIntUtils } from '../..'

const TRANSACTION_FEE_BYTE_LENGTH = 32

export type TransactionFeeRequest = {
  type: WorkerMessageType.transactionFee
  serializedTransactionPosted: Buffer
}

export type TransactionFeeResponse = {
  transactionFee: bigint
}

export class TransactionFeeReq {
  readonly br: bufio.BufferReader
  readonly bufferLength: number

  constructor(requestBody: Buffer) {
    this.br = bufio.read(requestBody)
    this.bufferLength = requestBody.length
  }

  static serialize(options: TransactionFeeRequest): Buffer {
    const bw = bufio.write()
    bw.writeBytes(options.serializedTransactionPosted)
    return bw.render()
  }

  serializedTransactionPosted(): Buffer {
    this.br.offset = 0
    const transactionLength = this.bufferLength - this.br.offset
    return this.br.readBytes(transactionLength)
  }
}

export class TransactionFeeResp {
  readonly br: bufio.BufferReader

  constructor(responseBody: Buffer) {
    this.br = bufio.read(responseBody)
  }

  static serialize(options: TransactionFeeResponse): Buffer {
    const bw = bufio.write()
    bw.writeBytes(BigIntUtils.toBytesBE(options.transactionFee))
    return bw.render()
  }

  deserialize(): TransactionFeeResponse {
    const transactionFee = BigIntUtils.fromBytes(this.br.readBytes(TRANSACTION_FEE_BYTE_LENGTH))
    return { transactionFee }
  }

  transactionFee(): bigint {
    this.br.offset = 0
    return BigIntUtils.fromBytes(this.br.readBytes(TRANSACTION_FEE_BYTE_LENGTH))
  }
}

export function handleTransactionFee(requestBody: Buffer): {
  responseType: WorkerMessageType
  response: Buffer
} {
  const request = new TransactionFeeReq(requestBody)
  const transaction = TransactionPosted.deserialize(request.serializedTransactionPosted())
  const fee = transaction.fee

  transaction.free()

  return {
    responseType: WorkerMessageType.transactionFee,
    response: TransactionFeeResp.serialize({
      transactionFee: fee.valueOf(),
    }),
  }
}
