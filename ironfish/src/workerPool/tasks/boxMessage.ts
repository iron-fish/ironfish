/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { Identity, PrivateIdentity } from '../../network/identity'
import { boxMessage } from '../../network/peers/encryption'
import { WorkerMessage, WorkerMessageType } from './workerMessage'
import { WorkerTask } from './workerTask'

export class BoxMessageRequest extends WorkerMessage {
  readonly message: string
  readonly sender: PrivateIdentity
  readonly recipient: Identity

  constructor(message: string, sender: PrivateIdentity, recipient: Identity, jobId?: number) {
    super(WorkerMessageType.BoxMessage, jobId)
    this.message = message
    this.sender = sender
    this.recipient = recipient
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    bw.writeVarString(this.message)
    bw.writeVarBytes(Buffer.from(this.sender.publicKey))
    bw.writeVarBytes(Buffer.from(this.sender.secretKey))
    bw.writeVarString(this.recipient)

    return bw.render()
  }

  static deserialize(jobId: number, buffer: Buffer): BoxMessageRequest {
    const reader = bufio.read(buffer, true)
    const message = reader.readVarString()
    const publicKey = Uint8Array.from(reader.readVarBytes())
    const secretKey = Uint8Array.from(reader.readVarBytes())
    const recipient = reader.readVarString()

    const sender: PrivateIdentity = { publicKey, secretKey }

    return new BoxMessageRequest(message, sender, recipient, jobId)
  }

  getSize(): number {
    return (
      bufio.sizeVarString(this.message) +
      bufio.sizeVarBytes(Buffer.from(this.sender.publicKey)) +
      bufio.sizeVarBytes(Buffer.from(this.sender.secretKey)) +
      bufio.sizeVarString(this.recipient)
    )
  }
}

export class BoxMessageResponse extends WorkerMessage {
  readonly nonce: string
  readonly boxedMessage: string

  constructor(nonce: string, boxedMessage: string, jobId: number) {
    super(WorkerMessageType.BoxMessage, jobId)
    this.nonce = nonce
    this.boxedMessage = boxedMessage
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    bw.writeVarString(this.nonce)
    bw.writeVarString(this.boxedMessage)

    return bw.render()
  }

  static deserialize(jobId: number, buffer: Buffer): BoxMessageResponse {
    const reader = bufio.read(buffer)
    const nonce = reader.readVarString()
    const boxedMessage = reader.readVarString()

    return new BoxMessageResponse(nonce, boxedMessage, jobId)
  }

  getSize(): number {
    return bufio.sizeVarString(this.nonce) + bufio.sizeVarString(this.boxedMessage)
  }
}

export class BoxMessageTask extends WorkerTask {
  private static instance: BoxMessageTask | undefined

  static getInstance(): BoxMessageTask {
    if (!BoxMessageTask.instance) {
      BoxMessageTask.instance = new BoxMessageTask()
    }
    return BoxMessageTask.instance
  }

  execute({ jobId, message, sender, recipient }: BoxMessageRequest): BoxMessageResponse {
    const { nonce, boxedMessage } = boxMessage(message, sender, recipient)

    return new BoxMessageResponse(nonce, boxedMessage, jobId)
  }
}
