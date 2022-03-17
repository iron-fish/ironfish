/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import bufio from 'bufio'
import {
  Identity,
  identityLength,
  PrivateIdentity,
  secretKeyLength,
} from '../../network/identity'
import { nonceLength, unboxMessage } from '../../network/peers/encryption'
import { WorkerMessage, WorkerMessageType } from './workerMessage'
import { WorkerTask } from './workerTask'

export class UnboxMessageRequest extends WorkerMessage {
  readonly boxedMessage: string
  readonly nonce: string
  readonly sender: Identity
  readonly recipient: PrivateIdentity

  constructor(
    boxedMessage: string,
    nonce: string,
    sender: Identity,
    recipient: PrivateIdentity,
    jobId?: number,
  ) {
    super(WorkerMessageType.UnboxMessage, jobId)
    this.boxedMessage = boxedMessage
    this.nonce = nonce
    this.sender = sender
    this.recipient = recipient
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    bw.writeVarString(this.boxedMessage)
    bw.writeBytes(Buffer.from(this.nonce, 'base64'))
    bw.writeBytes(Buffer.from(this.sender, 'base64'))
    bw.writeBytes(Buffer.from(this.recipient.secretKey))
    bw.writeBytes(Buffer.from(this.recipient.publicKey))
    return bw.render()
  }

  static deserialize(jobId: number, buffer: Buffer): UnboxMessageRequest {
    const reader = bufio.read(buffer, true)
    const boxedMessage = reader.readVarString()
    const nonce = reader.readBytes(nonceLength).toString('base64')
    const sender = reader.readBytes(identityLength).toString('base64')
    const secretKey = new Uint8Array(reader.readBytes(secretKeyLength))
    const publicKey = new Uint8Array(reader.readBytes(identityLength))
    const recipient = {
      secretKey,
      publicKey,
    }
    return new UnboxMessageRequest(boxedMessage, nonce, sender, recipient, jobId)
  }

  getSize(): number {
    return (
      bufio.sizeVarString(this.boxedMessage) +
      nonceLength +
      identityLength +
      secretKeyLength +
      identityLength
    )
  }
}

export class UnboxMessageResponse extends WorkerMessage {
  readonly message: string | null

  constructor(message: string | null, jobId?: number) {
    super(WorkerMessageType.UnboxMessage, jobId)
    this.message = message
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    if (this.message !== null) {
      bw.writeVarString(this.message)
    }
    return bw.render()
  }

  static deserialize(jobId: number, buffer: Buffer): UnboxMessageResponse {
    const reader = bufio.read(buffer, true)
    const message = reader.readVarString()
    return new UnboxMessageResponse(message, jobId)
  }

  getSize(): number {
    if (this.message !== null) {
      return bufio.sizeVarString(this.message)
    }
    return 0
  }
}

export class UnboxMessageTask extends WorkerTask {
  private static instance: UnboxMessageTask | undefined

  static getInstance(): UnboxMessageTask {
    if (!UnboxMessageTask.instance) {
      UnboxMessageTask.instance = new UnboxMessageTask()
    }
    return UnboxMessageTask.instance
  }

  execute({
    boxedMessage,
    nonce,
    sender,
    recipient,
    jobId,
  }: UnboxMessageRequest): UnboxMessageResponse {
    const result = unboxMessage(boxedMessage, nonce, sender, recipient)

    return new UnboxMessageResponse(result, jobId)
  }
}
