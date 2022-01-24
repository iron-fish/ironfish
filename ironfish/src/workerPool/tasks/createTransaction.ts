/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Note, Transaction } from 'ironfish-rust-nodejs'
import { Witness } from '../../merkletree'
import { NoteHasher } from '../../merkletree/hasher'
import { Side } from '../../merkletree/merkletree'
import { WorkerMessageType } from '../messages'
import bufio from 'bufio'
import { Assert, BigIntUtils } from '../..'

const SPEND_KEY_BYTE_LENGTH = 32
const FEE_BYTE_LENGTH = 32
const EXPIRATION_SEQ_BYTE_LENGTH = 8
const SPEND_RECEIVE_LENGTH_BYTE_LENGTH = 8
const PUBLIC_ADDRESS_BYTE_LENGTH = 43
const AMOUNT_BYTE_LENGTH = 32
const MEMO_BYTE_LENGTH = 32
const NOTE_BYTE_LENGTH = 32
const ROOT_HASH_BYTE_LENGTH = 32

// Needed for constructing a witness when creating transactions
const noteHasher = new NoteHasher()

export type CreateTransactionRequest = {
  type: WorkerMessageType.createTransaction
  spendKey: string
  transactionFee: bigint
  expirationSequence: number
  spendsLength: number
  receivesLength: number
  spends: {
    note: Buffer
    treeSize: number
    rootHash: Buffer
    authPathLength: number
    authPath: {
      side: Side
      hashOfSibling: Buffer
    }[]
  }[]
  receives: { publicAddress: string; amount: bigint; memo: string }[]
}

export type CreateTransactionResponse = {
  serializedTransactionPosted: Uint8Array
}

export class CreateTransactionReq {
  readonly br: bufio.BufferReader
  readonly bufferLength: number

  constructor(requestBody: Buffer) {
    this.br = bufio.read(requestBody)
    this.bufferLength = requestBody.length
  }

  static serialize(options: CreateTransactionRequest): Buffer {
    const bw = bufio.write()
    bw.writeBytes(Buffer.from(options.spendKey))
    bw.writeBytes(BigIntUtils.toBytesBE(options.transactionFee))
    bw.writeU64(options.expirationSequence)

    for (const spend of options.spends) {
      bw.writeBytes(spend.note)
      bw.writeU64(spend.treeSize)
      bw.writeBytes(spend.rootHash)

      for (const path of spend.authPath) {
        switch (path.side) {
          case Side.Left:
            bw.writeU32(0)
            break
          case Side.Right:
            bw.writeU32(1)
            break
          default:
            Assert.isNever(path.side)
        }
        bw.writeHash(path.hashOfSibling)
      }
    }

    return bw.render()
  }

  spendKey(): string {
    this.br.offset = 0
    return this.br.readHash('hex')
  }

  transactionFee(): bigint {
    this.br.offset = SPEND_KEY_BYTE_LENGTH
    return BigIntUtils.fromBytes(this.br.readBytes(FEE_BYTE_LENGTH))
  }

  expirationSequence(): number {
    this.br.offset = SPEND_KEY_BYTE_LENGTH + FEE_BYTE_LENGTH
    return this.br.readU64()
  }

  spends(): {
    note: Buffer
    treeSize: number
    rootHash: Buffer
    authPath: { side: Side; hashOfSibling: Buffer }[]
  }[] {
    this.br.offset = SPEND_KEY_BYTE_LENGTH + FEE_BYTE_LENGTH + EXPIRATION_SEQ_BYTE_LENGTH
    const spendsLength = this.br.readU64()
    let spends = []

    for (let i = 0; i < spendsLength; i++) {
      const note = this.br.readBytes(NOTE_BYTE_LENGTH)
      const treeSize = this.br.readU64()
      const rootHash = this.br.readBytes(ROOT_HASH_BYTE_LENGTH)
      const authPathLength = this.br.readU64()
      let authPath = []
      for (let j = 0; j < authPathLength; j++) {
        const side = this.br.readU32() ? Side.Right : Side.Left
        const hashOfSibling = this.br.readHash()
        authPath.push({ side, hashOfSibling })
      }
      spends.push({ note, treeSize, rootHash, authPath })
    }

    return spends
  }

  receives(): { publicAddress: string; amount: bigint; memo: string }[] {
    this.br.offset =
      SPEND_KEY_BYTE_LENGTH +
      FEE_BYTE_LENGTH +
      EXPIRATION_SEQ_BYTE_LENGTH +
      SPEND_RECEIVE_LENGTH_BYTE_LENGTH
    const receivesLength = this.br.readU64()

    // We re-calculate the offset from the end as there's no way to know each of
    // the different auth path lengths for each element in the spends list
    this.br.offset =
      this.bufferLength -
      receivesLength * (PUBLIC_ADDRESS_BYTE_LENGTH + AMOUNT_BYTE_LENGTH + MEMO_BYTE_LENGTH)
    let receives = []
    for (let i = 0; i < receivesLength; i++) {
      const publicAddress = this.br.readBytes(43).toString('hex')
      const amount = BigIntUtils.fromBytes(this.br.readBytes(32))
      const memo = this.br.readBytes(32).toString()
      receives.push({ publicAddress, amount, memo })
    }

    return receives
  }
}

export class CreateTransactionResp {
  readonly br: bufio.BufferReader
  readonly bufferLength: number

  constructor(responseBody: Buffer) {
    this.br = bufio.read(responseBody)
    this.bufferLength = responseBody.length
  }

  static serialize(options: CreateTransactionResponse): Buffer {
    const bw = bufio.write()
    bw.writeBytes(Buffer.from(options.serializedTransactionPosted))
    return bw.render()
  }

  deserialize(): CreateTransactionResponse {
    const transactionLength = this.bufferLength - this.br.offset
    const serializedTransactionPosted = Uint8Array.from(this.br.readBytes(transactionLength))

    return { serializedTransactionPosted }
  }

  serializedTransactionPosted(): Uint8Array {
    this.br.offset = 0
    const transactionLength = this.bufferLength - this.br.offset
    return Uint8Array.from(this.br.readBytes(transactionLength))
  }
}

export function handleCreateTransaction(requestBody: Buffer): {
  responseType: WorkerMessageType
  response: Buffer
} {
  const request = new CreateTransactionReq(requestBody)
  const transaction = new Transaction()
  transaction.setExpirationSequence(request.expirationSequence())

  for (const spend of request.spends()) {
    const note = Note.deserialize(spend.note)
    transaction.spend(
      request.spendKey(),
      note,
      new Witness(spend.treeSize, spend.rootHash, spend.authPath, noteHasher),
    )
    note.free()
  }

  for (const { publicAddress, amount, memo } of request.receives()) {
    const note = new Note(publicAddress, amount, memo)
    transaction.receive(request.spendKey(), note)
    note.free()
  }

  const postedTransaction = transaction.post(
    request.spendKey(),
    undefined,
    request.transactionFee(),
  )

  const serializedTransactionPosted = Buffer.from(postedTransaction.serialize())

  transaction.free()
  postedTransaction.free()

  return {
    responseType: WorkerMessageType.createTransaction,
    response: CreateTransactionResp.serialize({
      serializedTransactionPosted,
    }),
  }
}
