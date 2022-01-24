/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { TransactionPosted } from 'ironfish-rust-nodejs'
import { WorkerMessageType } from '../messages'
import bufio from 'bufio'

const VERIFIED_FLAG_BYTE_LENGTH = 4

export interface VerifyTransactionOptions {
  verifyFees?: boolean
}

export type VerifyTransactionRequest = {
  type: WorkerMessageType.verify
  serializedTransactionPosted: Buffer
  options?: VerifyTransactionOptions
}

export type VerifyTransactionResponse = {
  verified: boolean
}

export class VerifyTransactionReq {
  readonly br: bufio.BufferReader
  readonly bufferLength: number

  constructor(requestBody: Buffer) {
    this.br = bufio.read(requestBody)
    this.bufferLength = requestBody.length
  }

  static serialize(options: VerifyTransactionRequest): Buffer {
    const bw = bufio.write()
    bw.writeU32(options.options?.verifyFees ? 1 : 0)
    bw.writeBytes(options.serializedTransactionPosted)
    return bw.render()
  }

  verifyFees(): boolean {
    this.br.offset = 0
    return Boolean(this.br.readU32())
  }

  serializedTransactionPosted(): Buffer {
    this.br.offset = VERIFIED_FLAG_BYTE_LENGTH
    const transactionLength = this.bufferLength - this.br.offset
    return this.br.readBytes(transactionLength)
  }
}

export class VerifyTransactionResp {
  readonly br: bufio.BufferReader

  constructor(responseBody: Buffer) {
    this.br = bufio.read(responseBody)
  }

  static serialize(options: VerifyTransactionResponse): Buffer {
    const bw = bufio.write()
    bw.writeU32(options.verified ? 1 : 0)
    return bw.render()
  }

  deserialize(): VerifyTransactionResponse {
    const verified = Boolean(this.br.readU32())

    return { verified }
  }

  verified(): boolean {
    this.br.offset = 0
    return Boolean(this.br.readU32())
  }
}

export function handleVerifyTransaction(requestBody: Buffer): {
  responseType: WorkerMessageType
  response: Buffer
} {
  const request = new VerifyTransactionReq(requestBody)
  let transaction

  let verified = false
  try {
    transaction = TransactionPosted.deserialize(request.serializedTransactionPosted())

    if (request.verifyFees() && transaction.fee < BigInt(0)) {
      throw new Error('Transaction has negative fees')
    }

    verified = transaction.verify()
  } catch {
    verified = false
  } finally {
    transaction?.free()
  }

  return {
    responseType: WorkerMessageType.verify,
    response: VerifyTransactionResp.serialize({ verified }),
  }
}
