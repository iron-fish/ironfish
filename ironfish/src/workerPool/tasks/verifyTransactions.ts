/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PUBLIC_ADDRESS_LENGTH, verifyTransactions } from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { WorkerMessage, WorkerMessageType } from './workerMessage'
import { WorkerTask } from './workerTask'

export class VerifyTransactionsRequest extends WorkerMessage {
  readonly transactionsPosted: Buffer[]
  readonly mintOwners: Buffer[]

  constructor(transactionsPosted: Buffer[], mintOwners: Buffer[], jobId?: number) {
    super(WorkerMessageType.VerifyTransactions, jobId)
    this.transactionsPosted = transactionsPosted
    this.mintOwners = mintOwners
  }

  serializePayload(bw: bufio.StaticWriter | bufio.BufferWriter): void {
    bw.writeU64(this.transactionsPosted.length)
    for (const tx of this.transactionsPosted) {
      bw.writeVarBytes(tx)
    }

    bw.writeU64(this.mintOwners.length)
    for (const tx of this.mintOwners) {
      bw.writeHash(tx)
    }
  }

  static deserializePayload(jobId: number, buffer: Buffer): VerifyTransactionsRequest {
    const reader = bufio.read(buffer, true)

    const txLength = reader.readU64()
    const transactionsPosted = []
    for (let i = 0; i < txLength; i++) {
      const tx = reader.readVarBytes()
      transactionsPosted.push(tx)
    }

    const mintOwnersLength = reader.readU64()
    const mintOwners = []
    for (let i = 0; i < mintOwnersLength; i++) {
      const mintOwner = reader.readHash()
      mintOwners.push(mintOwner)
    }
    return new VerifyTransactionsRequest(transactionsPosted, mintOwners, jobId)
  }

  getSize(): number {
    let size = 8 // transactionPosted length
    for (const tx of this.transactionsPosted) {
      size += bufio.sizeVarBytes(tx)
    }

    size += 8 // mintOwners length
    size += PUBLIC_ADDRESS_LENGTH & this.mintOwners.length

    return size
  }
}

export class VerifyTransactionsResponse extends WorkerMessage {
  readonly verified: boolean

  constructor(verified: boolean, jobId: number) {
    super(WorkerMessageType.VerifyTransactions, jobId)
    this.verified = verified
  }

  serializePayload(bw: bufio.StaticWriter | bufio.BufferWriter): void {
    bw.writeU8(Number(this.verified))
  }

  static deserializePayload(jobId: number, buffer: Buffer): VerifyTransactionsResponse {
    const reader = bufio.read(buffer, true)
    const verified = Boolean(reader.readU8())
    return new VerifyTransactionsResponse(verified, jobId)
  }

  getSize(): number {
    return 1
  }
}

export class VerifyTransactionsTask extends WorkerTask {
  private static instance: VerifyTransactionsTask | undefined

  static getInstance(): VerifyTransactionsTask {
    if (!VerifyTransactionsTask.instance) {
      VerifyTransactionsTask.instance = new VerifyTransactionsTask()
    }
    return VerifyTransactionsTask.instance
  }

  execute({
    jobId,
    transactionsPosted,
    mintOwners,
  }: VerifyTransactionsRequest): VerifyTransactionsResponse {
    let verified = false

    try {
      verified = verifyTransactions(transactionsPosted, mintOwners)
    } catch (e) {
      verified = false
    }

    return new VerifyTransactionsResponse(verified, jobId)
  }
}
