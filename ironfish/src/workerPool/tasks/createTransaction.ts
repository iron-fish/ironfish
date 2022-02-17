/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import bufio from 'bufio'
import { Note, NoteBuilder, Transaction } from 'ironfish-rust-nodejs'
import { Assert, BigIntUtils } from '../..'
import { Witness } from '../../merkletree'
import { NoteHasher } from '../../merkletree/hasher'
import { Side } from '../../merkletree/merkletree'

const SPEND_KEY_BYTE_LENGTH = 64
const FEE_BYTE_LENGTH = 32
const EXPIRATION_SEQ_BYTE_LENGTH = 8
const PUBLIC_ADDRESS_BYTE_LENGTH = 86
const AMOUNT_BYTE_LENGTH = 32
const ROOT_HASH_BYTE_LENGTH = 32

// Needed for constructing a witness when creating transactions
const noteHasher = new NoteHasher()

export type CreateTransactionRequest = {
  type: 'createTransaction'
  spendKey: string
  transactionFee: bigint
  expirationSequence: number
  spends: {
    note: Buffer
    treeSize: number
    rootHash: Buffer
    authPath: {
      side: Side
      hashOfSibling: Buffer
    }[]
  }[]
  receives: { publicAddress: string; amount: bigint; memo: string }[]
}

export type CreateTransactionResponse = {
  type: 'createTransaction'
  serializedTransactionPosted: Uint8Array
}

export class BinaryCreateTransactionRequest {
  readonly br: bufio.BufferReader
  readonly bufferLength: number

  constructor(requestBody: Buffer) {
    this.br = bufio.read(requestBody)
    this.bufferLength = requestBody.length
  }

  static serialize(options: CreateTransactionRequest): Buffer {
    const bw = bufio.write()
    bw.writeBytes(Buffer.from(options.spendKey))
    bw.writeBytes(BigIntUtils.toBytesBE(options.transactionFee, FEE_BYTE_LENGTH))
    bw.writeU64(options.expirationSequence)

    bw.writeU64(options.spends.length)
    for (const spend of options.spends) {
      bw.writeVarBytes(Buffer.from(spend.note))
      bw.writeU64(spend.treeSize)
      bw.writeBytes(spend.rootHash)

      bw.writeU64(spend.authPath.length)
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

    bw.writeU64(options.receives.length)
    for (const receive of options.receives) {
      bw.writeBytes(Buffer.from(receive.publicAddress))
      bw.writeBytes(BigIntUtils.toBytesBE(receive.amount, AMOUNT_BYTE_LENGTH))
      bw.writeVarBytes(Buffer.from(receive.memo))
    }

    return bw.render()
  }

  spendKey(): string {
    this.br.offset = 0
    return this.br.readBytes(SPEND_KEY_BYTE_LENGTH, true).toString()
  }

  transactionFee(): bigint {
    this.br.offset = SPEND_KEY_BYTE_LENGTH
    return BigIntUtils.fromBytes(this.br.readBytes(FEE_BYTE_LENGTH))
  }

  expirationSequence(): number {
    this.br.offset = SPEND_KEY_BYTE_LENGTH + FEE_BYTE_LENGTH
    return this.br.readU64()
  }

  spendsReceives(): {
    spends: {
      note: Buffer
      treeSize: number
      rootHash: Buffer
      authPath: { side: Side; hashOfSibling: Buffer }[]
    }[]
    receives: { publicAddress: string; amount: bigint; memo: string }[]
  } {
    this.br.offset = SPEND_KEY_BYTE_LENGTH + FEE_BYTE_LENGTH + EXPIRATION_SEQ_BYTE_LENGTH
    const spendsLength = this.br.readU64()
    const spends = []

    for (let i = 0; i < spendsLength; i++) {
      const note = this.br.readVarBytes()
      const treeSize = this.br.readU64()
      const rootHash = this.br.readBytes(ROOT_HASH_BYTE_LENGTH)
      const authPathLength = this.br.readU64()
      const authPath = []
      for (let j = 0; j < authPathLength; j++) {
        const side = this.br.readU32() ? Side.Right : Side.Left
        const hashOfSibling = this.br.readHash()
        authPath.push({ side, hashOfSibling })
      }
      spends.push({ note, treeSize, rootHash, authPath })
    }

    const receivesLength = this.br.readU64()
    const receives = []
    for (let i = 0; i < receivesLength; i++) {
      const publicAddress = this.br.readBytes(PUBLIC_ADDRESS_BYTE_LENGTH).toString()
      const amount = BigIntUtils.fromBytes(this.br.readBytes(AMOUNT_BYTE_LENGTH))
      const memo = this.br.readVarBytes().toString()
      receives.push({ publicAddress, amount, memo })
    }

    return { spends, receives }
  }
}

export class BinaryCreateTransactionResponse {
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

    return { type: 'createTransaction', serializedTransactionPosted }
  }

  serializedTransactionPosted(): Uint8Array {
    this.br.offset = 0
    const transactionLength = this.bufferLength - this.br.offset
    return Uint8Array.from(this.br.readBytes(transactionLength))
  }
}

export function handleCreateTransaction(requestBody: Buffer): {
  responseType: string
  response: Buffer
} {
  const request = new BinaryCreateTransactionRequest(requestBody)
  const transaction = new Transaction()
  transaction.setExpirationSequence(request.expirationSequence())

  const { spends, receives } = request.spendsReceives()

  for (const spend of spends) {
    const note = new Note(spend.note)
    transaction.spend(
      request.spendKey(),
      note,
      new Witness(spend.treeSize, spend.rootHash, spend.authPath, noteHasher),
    )
  }

  for (const { publicAddress, amount, memo } of receives) {
    const note = new Note(new NoteBuilder(publicAddress, amount, memo).serialize())
    transaction.receive(request.spendKey(), note)
  }

  const postedTransaction = transaction.post(
    request.spendKey(),
    undefined,
    request.transactionFee(),
  )

  const serializedTransactionPosted = Buffer.from(postedTransaction.serialize())

  return {
    responseType: 'createTransaction',
    response: BinaryCreateTransactionResponse.serialize({
      type: 'createTransaction',
      serializedTransactionPosted,
    }),
  }
}
