/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import bufio from 'bufio'
import { MessagePort, Worker as WorkerThread } from 'worker_threads'
import { Serializable } from '../../common/serializable'
import { WorkerHeader } from '../interfaces/workerHeader'

export const WORKER_MESSAGE_HEADER_SIZE = 9

export enum WorkerMessageType {
  CreateMinersFee = 0,
  DecryptNotes = 2,
  JobAborted = 3,
  JobError = 4,
  Sleep = 5,
  SubmitTelemetry = 6,
  VerifyTransactions = 7,
  PostTransaction = 8,
  BuildTransaction = 9,
}

export abstract class WorkerMessage implements Serializable {
  private static id = 0

  jobId: number
  type: WorkerMessageType

  constructor(type: WorkerMessageType, jobId?: number) {
    this.jobId = jobId ?? WorkerMessage.id++
    this.type = type
  }

  abstract serializePayload(bw: bufio.StaticWriter | bufio.BufferWriter): void
  abstract getSize(): number

  getSharedMemoryPayload(): SharedArrayBuffer | null {
    return null
  }

  static deserializeHeader(buffer: Buffer): WorkerHeader {
    const br = bufio.read(buffer)
    const jobId = Number(br.readU64())
    const type = br.readU8()
    // TODO(mat): can we utilize zero copy here?
    return {
      jobId,
      type,
      body: br.readBytes(br.left()),
    }
  }

  /**
   * Serializes the contents of this message into a `Buffer` to be sent to a
   * worker.
   *
   * Note that the `Buffer` will be *transferred* to the destination worker.
   * This means that the buffer will become inutilizable from the sending
   * context once sent. For this reason, it's important that the returned
   * `Buffer` does not reference any memory that will be needed later by the
   * sending context. An easy way to ensure that is to create a new `Buffer`
   * every time this method is called.
   *
   * See https://developer.mozilla.org/en-US/docs/Web/API/Worker/postMessage
   * for more details on transfers.
   */
  serialize(): Buffer {
    const bw = bufio.write(WORKER_MESSAGE_HEADER_SIZE + this.getSize())
    bw.writeU64(this.jobId)
    bw.writeU8(this.type)
    this.serializePayload(bw)
    return bw.render()
  }

  post(thread: WorkerThread | MessagePort) {
    const body = this.serialize().buffer
    const sharedData = this.getSharedMemoryPayload()
    thread.postMessage([body, sharedData], [body])
  }
}
