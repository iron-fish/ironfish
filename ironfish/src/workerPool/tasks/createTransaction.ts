/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset, ASSET_LENGTH, Note, Transaction } from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { Witness } from '../../merkletree'
import { NoteHasher } from '../../merkletree/hasher'
import { Side } from '../../merkletree/merkletree'
import { BigIntUtils } from '../../utils/bigint'
import { WorkerMessage, WorkerMessageType } from './workerMessage'
import { WorkerTask } from './workerTask'

// Needed for constructing a witness when creating transactions
const noteHasher = new NoteHasher()

export class CreateTransactionRequest extends WorkerMessage {
  readonly spendKey: string
  readonly transactionFee: bigint
  readonly expirationSequence: number
  readonly spends: {
    note: Buffer
    treeSize: number
    rootHash: Buffer
    authPath: {
      side: Side
      hashOfSibling: Buffer
    }[]
  }[]
  readonly receives: { publicAddress: string; amount: bigint; memo: string }[]
  readonly mints: { asset: Asset; value: bigint }[]
  readonly burns: { asset: Asset; value: bigint }[]

  constructor(
    spendKey: string,
    transactionFee: bigint,
    expirationSequence: number,
    spends: {
      note: Buffer
      treeSize: number
      rootHash: Buffer
      authPath: { side: Side; hashOfSibling: Buffer }[]
    }[],
    receives: { publicAddress: string; amount: bigint; memo: string }[],
    mints: { asset: Asset; value: bigint }[],
    burns: { asset: Asset; value: bigint }[],
    jobId?: number,
  ) {
    super(WorkerMessageType.CreateTransaction, jobId)
    this.spendKey = spendKey
    this.transactionFee = transactionFee
    this.expirationSequence = expirationSequence
    this.spends = spends
    this.receives = receives
    this.mints = mints
    this.burns = burns
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    bw.writeVarString(this.spendKey)
    bw.writeVarBytes(BigIntUtils.toBytesBE(this.transactionFee))
    bw.writeU64(this.expirationSequence)
    bw.writeU64(this.spends.length)

    for (const spend of this.spends) {
      bw.writeVarBytes(Buffer.from(spend.note))
      bw.writeU64(spend.treeSize)
      bw.writeVarBytes(spend.rootHash)
      bw.writeU64(spend.authPath.length)

      for (const step of spend.authPath) {
        switch (step.side) {
          case Side.Left:
            bw.writeU8(0)
            break
          case Side.Right:
            bw.writeU8(1)
            break
        }
        bw.writeVarBytes(step.hashOfSibling)
      }
    }

    bw.writeU64(this.receives.length)
    for (const receive of this.receives) {
      bw.writeVarString(receive.publicAddress)
      bw.writeVarBytes(BigIntUtils.toBytesBE(receive.amount))
      bw.writeVarString(receive.memo, 'utf8')
    }

    bw.writeU64(this.mints.length)
    for (const mint of this.mints) {
      bw.writeBytes(mint.asset.serialize())
      bw.writeVarBytes(BigIntUtils.toBytesBE(mint.value))
    }

    bw.writeU64(this.burns.length)
    for (const burn of this.burns) {
      bw.writeBytes(burn.asset.serialize())
      bw.writeVarBytes(BigIntUtils.toBytesBE(burn.value))
    }

    return bw.render()
  }

  static deserialize(jobId: number, buffer: Buffer): CreateTransactionRequest {
    const reader = bufio.read(buffer, true)
    const spendKey = reader.readVarString()
    const transactionFee = BigIntUtils.fromBytes(reader.readVarBytes())
    const expirationSequence = reader.readU64()

    const spendsLength = reader.readU64()
    const spends = []
    for (let i = 0; i < spendsLength; i++) {
      const note = reader.readVarBytes()
      const treeSize = reader.readU64()
      const rootHash = reader.readVarBytes()

      const authPathLength = reader.readU64()
      const authPath = []
      for (let j = 0; j < authPathLength; j++) {
        const side = reader.readU8() ? Side.Right : Side.Left
        const hashOfSibling = reader.readVarBytes()
        authPath.push({ side, hashOfSibling })
      }

      spends.push({ note, treeSize, rootHash, authPath })
    }

    const receivesLength = reader.readU64()
    const receives = []
    for (let i = 0; i < receivesLength; i++) {
      const publicAddress = reader.readVarString()
      const amount = BigIntUtils.fromBytes(reader.readVarBytes())
      const memo = reader.readVarString('utf8')
      receives.push({ publicAddress, amount, memo })
    }

    const mintsLength = reader.readU64()
    const mints = []
    for (let i = 0; i < mintsLength; i++) {
      const asset = Asset.deserialize(reader.readBytes(ASSET_LENGTH))
      const value = BigIntUtils.fromBytes(reader.readVarBytes())
      mints.push({ asset, value })
    }

    const burnsLength = reader.readU64()
    const burns = []
    for (let i = 0; i < burnsLength; i++) {
      const asset = Asset.deserialize(reader.readBytes(ASSET_LENGTH))
      const value = BigIntUtils.fromBytes(reader.readVarBytes())
      burns.push({ asset, value })
    }

    return new CreateTransactionRequest(
      spendKey,
      transactionFee,
      expirationSequence,
      spends,
      receives,
      mints,
      burns,
      jobId,
    )
  }

  getSize(): number {
    let spendsSize = 0

    for (const spend of this.spends) {
      let authPathSize = 0
      for (const step of spend.authPath) {
        authPathSize += 1 // side
        authPathSize += bufio.sizeVarBytes(step.hashOfSibling)
      }
      spendsSize +=
        bufio.sizeVarBytes(Buffer.from(spend.note)) +
        8 + // treeSize
        bufio.sizeVarBytes(spend.rootHash) +
        8 + // authPath length
        authPathSize
    }

    let receivesSize = 0
    for (const receive of this.receives) {
      receivesSize +=
        bufio.sizeVarString(receive.publicAddress) +
        bufio.sizeVarBytes(BigIntUtils.toBytesBE(receive.amount)) +
        bufio.sizeVarString(receive.memo, 'utf8')
    }

    let mintsSize = 0
    for (const mint of this.mints) {
      mintsSize += ASSET_LENGTH + bufio.sizeVarBytes(BigIntUtils.toBytesBE(mint.value))
    }

    let burnsSize = 0
    for (const burn of this.burns) {
      burnsSize += ASSET_LENGTH + bufio.sizeVarBytes(BigIntUtils.toBytesBE(burn.value))
    }

    return (
      bufio.sizeVarString(this.spendKey) +
      bufio.sizeVarBytes(BigIntUtils.toBytesBE(this.transactionFee)) +
      8 + // expirationSequence
      8 + // spends length
      spendsSize +
      8 + // receives length
      receivesSize +
      8 + // mints length
      mintsSize +
      8 + // burns length
      burnsSize
    )
  }
}

export class CreateTransactionResponse extends WorkerMessage {
  readonly serializedTransactionPosted: Uint8Array

  constructor(serializedTransactionPosted: Buffer, jobId: number) {
    super(WorkerMessageType.CreateTransaction, jobId)
    this.serializedTransactionPosted = Uint8Array.from(serializedTransactionPosted)
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    bw.writeVarBytes(Buffer.from(this.serializedTransactionPosted))
    return bw.render()
  }

  static deserialize(jobId: number, buffer: Buffer): CreateTransactionResponse {
    const reader = bufio.read(buffer, true)
    const serializedTransactionPosted = reader.readVarBytes()
    return new CreateTransactionResponse(serializedTransactionPosted, jobId)
  }

  getSize(): number {
    return bufio.sizeVarBytes(Buffer.from(this.serializedTransactionPosted))
  }
}

export class CreateTransactionTask extends WorkerTask {
  private static instance: CreateTransactionTask | undefined

  static getInstance(): CreateTransactionTask {
    if (!CreateTransactionTask.instance) {
      CreateTransactionTask.instance = new CreateTransactionTask()
    }

    return CreateTransactionTask.instance
  }

  execute({
    jobId,
    transactionFee,
    spendKey,
    spends,
    receives,
    mints,
    burns,
    expirationSequence,
  }: CreateTransactionRequest): CreateTransactionResponse {
    console.log({
      spends,
      receives,
      mints,
      burns,
      transactionFee,
    })
    const transaction = new Transaction(spendKey)
    transaction.setExpirationSequence(expirationSequence)

    for (const spend of spends) {
      const note = Note.deserialize(spend.note)
      console.log('spend note ident', note.assetIdentifier())
      transaction.spend(
        note,
        new Witness(spend.treeSize, spend.rootHash, spend.authPath, noteHasher),
      )
    }

    for (const { publicAddress, amount, memo } of receives) {
      const note = new Note(publicAddress, amount, memo)
      transaction.receive(note)
    }

    for (const { asset, value } of mints) {
      transaction.mint(asset, value)
    }

    for (const { asset, value } of burns) {
      console.log('burning', asset, value, asset.identifier())
      transaction.burn(asset, value)
    }

    const serializedTransactionPosted = transaction.post(undefined, transactionFee)

    return new CreateTransactionResponse(serializedTransactionPosted, jobId)
  }
}
