/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { mineHeader } from '../../mining/mineHeader'
import { WorkerMessageType } from '../messages'
import bufio from 'bufio'

const BATCH_SIZE_BYTE_LENGTH = 8
const HEADER_BYTES_LENGTH = 32
const INITIAL_RAND_BYTE_LENGTH = 8
const MINING_REQ_BYTE_LENGTH = 8

export type MineHeaderRequest = {
  type: WorkerMessageType.mineHeader
  batchSize: number
  headerBytesWithoutRandomness: Uint8Array
  initialRandomness: number
  miningRequestId: number
  targetValue: string
}

export type MineHeaderResponse = {
  initialRandomness: number
  miningRequestId?: number
  randomness?: number
}

export class MineHeaderReq {
  readonly br: bufio.BufferReader

  constructor(requestBody: Buffer) {
    this.br = bufio.read(requestBody)
  }

  static serialize(options: MineHeaderRequest): Buffer {
    const bw = bufio.write()
    bw.writeU64(options.batchSize)
    bw.writeBytes(Buffer.from(options.headerBytesWithoutRandomness))
    bw.writeU64(options.initialRandomness)
    bw.writeU64(options.miningRequestId)
    bw.writeBytes(Buffer.from(options.targetValue))
    return bw.render()
  }

  batchSize(): number {
    this.br.offset = 0
    return this.br.readU64()
  }

  headerBytesWithoutRandomness(): Uint8Array {
    this.br.offset = BATCH_SIZE_BYTE_LENGTH
    return Uint8Array.from(this.br.readBytes(HEADER_BYTES_LENGTH))
  }

  initialRandomness(): number {
    this.br.offset = BATCH_SIZE_BYTE_LENGTH + HEADER_BYTES_LENGTH
    return this.br.readU64()
  }

  miningRequestId(): number {
    this.br.offset = BATCH_SIZE_BYTE_LENGTH + HEADER_BYTES_LENGTH + INITIAL_RAND_BYTE_LENGTH
    return this.br.readU64()
  }

  targetValue(): string {
    this.br.offset =
      BATCH_SIZE_BYTE_LENGTH +
      HEADER_BYTES_LENGTH +
      INITIAL_RAND_BYTE_LENGTH +
      MINING_REQ_BYTE_LENGTH
    return this.br.readBytes(32).toString()
  }
}

export class MineHeaderResp {
  readonly br: bufio.BufferReader

  constructor(responseBody: Buffer) {
    this.br = bufio.read(responseBody)
  }

  static serialize(options: MineHeaderResponse): Buffer {
    const bw = bufio.write()
    bw.writeU64(options.initialRandomness)

    if (options.miningRequestId) {
      bw.writeU32(options.miningRequestId)
    }

    if (options.randomness) {
      bw.writeU32(options.randomness)
    }

    return bw.render()
  }

  deserialize(): MineHeaderResponse {
    const initialRandomness = this.br.readU64()
    let miningRequestId = undefined
    let randomness = undefined

    try {
      miningRequestId = this.br.readU64()
    } catch (error) {
      miningRequestId = undefined
    }

    try {
      randomness = this.br.readU64()
    } catch (error) {
      randomness = undefined
    }

    return { initialRandomness, miningRequestId, randomness }
  }

  initialRandomness(): number {
    this.br.offset = 0
    return this.br.readU64()
  }

  miningRequestId(): number | undefined {
    this.br.offset = INITIAL_RAND_BYTE_LENGTH
    let miningRequestId = undefined

    try {
      miningRequestId = this.br.readU64()
    } catch (error) {
      miningRequestId = undefined
    }

    return miningRequestId
  }

  randomness(): number | undefined {
    this.br.offset = INITIAL_RAND_BYTE_LENGTH + MINING_REQ_BYTE_LENGTH

    let randomness = undefined
    try {
      randomness = this.br.readU64()
    } catch (error) {
      randomness = undefined
    }

    return randomness
  }
}

export function handleMineHeader(
  requestBody: Buffer,
  job: Job,
): { responseType: WorkerMessageType; response: Buffer } {
  const request = new MineHeaderReq(requestBody)
  const result = mineHeader({
    batchSize: request.batchSize(),
    headerBytesWithoutRandomness: request.headerBytesWithoutRandomness(),
    initialRandomness: request.initialRandomness(),
    miningRequestId: request.miningRequestId(),
    targetValue: request.targetValue(),
    job,
  })

  return {
    responseType: WorkerMessageType.mineHeader,
    response: MineHeaderResp.serialize({ ...result }),
  }
}
