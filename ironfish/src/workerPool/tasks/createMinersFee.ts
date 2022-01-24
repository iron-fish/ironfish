/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { generateNewPublicAddress, Note, Transaction } from 'ironfish-rust-nodejs'
import bufio from 'bufio'
import { BigIntUtils } from '../../utils'
import { WorkerMessageType } from '../messages'

export type CreateMinersFeeRequest = {
  type: WorkerMessageType.createMinersFee
  spendKey: string
  amount: bigint
  memo: string
}

const SPEND_KEY_BYTE_LENGTH = 32
const AMOUNT_BYTE_LENGTH = 32

export type CreateMinersFeeResponse = {
  serializedTransactionPosted: Uint8Array
}

export class CreateMinersFeeReq {
  readonly br: bufio.BufferReader
  // TODO: Look into caching fields that have been read once

  constructor(requestBody: Buffer) {
    this.br = bufio.read(requestBody)
  }

  static serialize(options: CreateMinersFeeRequest): Buffer {
    const bw = bufio.write()
    bw.writeBytes(Buffer.from(options.spendKey))
    bw.writeBytes(BigIntUtils.toBytesBE(options.amount))
    bw.writeBytes(Buffer.from(options.memo))
    return bw.render()
  }

  spendKey(): string {
    this.br.offset = 0
    return this.br.readHash('hex')
  }

  amount(): bigint {
    this.br.offset = SPEND_KEY_BYTE_LENGTH
    return BigIntUtils.fromBytes(this.br.readBytes(AMOUNT_BYTE_LENGTH))
  }

  memo(): string {
    this.br.offset = SPEND_KEY_BYTE_LENGTH + AMOUNT_BYTE_LENGTH
    return this.br.readBytes(32, true).toString()
  }
}

export class CreateMinersFeeResp {
  readonly br: bufio.BufferReader
  readonly bufferLength: number

  constructor(responseBody: Buffer) {
    this.br = bufio.read(responseBody)
    this.bufferLength = responseBody.length
  }

  static serialize(options: CreateMinersFeeResponse): Buffer {
    const bw = bufio.write()
    bw.writeBytes(Buffer.from(options.serializedTransactionPosted))
    return bw.render()
  }

  deserialize(): CreateMinersFeeResponse {
    const transactionLength = this.bufferLength
    const serializedTransactionPosted = Uint8Array.from(this.br.readBytes(transactionLength))

    return { serializedTransactionPosted }
  }

  serializedTransactionPosted(): Uint8Array {
    this.br.offset = 0
    const transactionLength = this.bufferLength - this.br.offset
    return Uint8Array.from(this.br.readBytes(transactionLength))
  }
}

export function handleCreateMinersFee(requestBody: Buffer): {
  responseType: WorkerMessageType
  response: Buffer
} {
  const request = new CreateMinersFeeReq(requestBody)

  // Generate a public address from the miner's spending key
  const minerPublicAddress = generateNewPublicAddress(request.spendKey()).public_address

  const minerNote = new Note(minerPublicAddress, request.amount(), request.memo())

  const transaction = new Transaction()
  transaction.receive(request.spendKey(), minerNote)

  const postedTransaction = transaction.post_miners_fee()

  const serializedTransactionPosted = Buffer.from(postedTransaction.serialize())

  minerNote.free()
  transaction.free()
  postedTransaction.free()

  return {
    responseType: WorkerMessageType.createMinersFee,
    response: CreateMinersFeeResp.serialize({
      serializedTransactionPosted,
    }),
  }
}
