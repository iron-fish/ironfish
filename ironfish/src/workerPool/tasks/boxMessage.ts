/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Identity, PrivateIdentity } from '../../network/identity'
import { boxMessage } from '../../network/peers/encryption'
import { WorkerMessageType } from '../messages'
import bufio from 'bufio'
import tweetnacl from 'tweetnacl'

const PUBLIC_KEY_LENGTH = tweetnacl.box.publicKeyLength
const SECRET_KEY_LENGTH = tweetnacl.box.secretKeyLength
const NONCE_LENGTH = tweetnacl.box.nonceLength
const IDENTITY_LENGTH = 32

export type BoxMessageRequest = {
  type: WorkerMessageType.boxMessage
  message: string
  sender: PrivateIdentity
  recipient: Identity
}

export type BoxMessageResponse = {
  nonce: string
  boxedMessage: string
}

export class BoxMessageReq {
  readonly br: bufio.BufferReader
  readonly bufferLength: number

  constructor(requestBody: Buffer) {
    this.br = bufio.read(requestBody)
    this.bufferLength = requestBody.length
  }

  static serialize(options: BoxMessageRequest) {
    const bw = bufio.write()
    bw.writeBytes(Buffer.from(options.sender.publicKey))
    bw.writeBytes(Buffer.from(options.sender.secretKey))
    bw.writeBytes(Buffer.from(options.recipient))
    bw.writeBytes(Buffer.from(options.message))
    return bw.render()
  }

  sender(): PrivateIdentity {
    this.br.offset = 0
    const publicKey = Uint8Array.from(this.br.readBytes(PUBLIC_KEY_LENGTH))
    const secretKey = Uint8Array.from(this.br.readBytes(SECRET_KEY_LENGTH))
    return { publicKey, secretKey }
  }

  recipient(): Identity {
    this.br.offset = PUBLIC_KEY_LENGTH + SECRET_KEY_LENGTH
    return this.br.readBytes(IDENTITY_LENGTH).toString()
  }

  message(): string {
    this.br.offset = PUBLIC_KEY_LENGTH + SECRET_KEY_LENGTH + IDENTITY_LENGTH
    const messageLength = this.bufferLength - this.br.offset
    return this.br.readBytes(messageLength).toString()
  }
}

export class BoxMessageResp {
  readonly br: bufio.BufferReader
  readonly bufferLength: number

  constructor(responseBody: Buffer) {
    this.br = bufio.read(responseBody)
    this.bufferLength = responseBody.length
  }

  static serialize(options: BoxMessageResponse) {
    const bw = bufio.write()
    bw.writeBytes(Buffer.from(options.nonce))
    bw.writeBytes(Buffer.from(options.boxedMessage))
    return bw.render()
  }

  deserialize(): BoxMessageResponse {
    const nonce = this.br.readBytes(NONCE_LENGTH).toString()
    const boxedMessageLength = this.bufferLength - this.br.offset
    const boxedMessage = this.br.readBytes(boxedMessageLength).toString()

    return { nonce, boxedMessage }
  }

  nonce(): string {
    this.br.offset = 0
    return this.br.readBytes(NONCE_LENGTH).toString()
  }

  boxedMessage(): string {
    this.br.offset = NONCE_LENGTH
    const boxedMessageLength = this.bufferLength - this.br.offset
    return this.br.readBytes(boxedMessageLength).toString()
  }
}

export function handleBoxMessage(requestBody: Buffer): {
  responseType: WorkerMessageType
  response: Buffer
} {
  const request = new BoxMessageReq(requestBody)
  const { nonce, boxedMessage } = boxMessage(
    request.message(),
    request.sender(),
    request.recipient(),
  )
  return {
    responseType: WorkerMessageType.boxMessage,
    response: BoxMessageResp.serialize({
      nonce,
      boxedMessage,
    }),
  }
}
