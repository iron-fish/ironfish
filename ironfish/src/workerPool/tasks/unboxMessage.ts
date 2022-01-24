/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Identity, PrivateIdentity } from '../../network/identity'
import { unboxMessage } from '../../network/peers/encryption'
import { WorkerMessageType } from '../messages'

import bufio from 'bufio'
import tweetnacl from 'tweetnacl'

const PUBLIC_KEY_BYTE_LENGTH = tweetnacl.box.publicKeyLength
const SECRET_KEY_BYTE_LENGTH = tweetnacl.box.secretKeyLength
const NONCE_BYTE_LENGTH = tweetnacl.box.nonceLength
const IDENTITY_BYTE_LENGTH = 32

export type UnboxMessageRequest = {
  type: WorkerMessageType.unboxMessage
  boxedMessage: string
  nonce: string
  sender: Identity
  recipient: PrivateIdentity
}

export type UnboxMessageResponse = {
  message: string | null
}

export class UnboxMessageReq {
  readonly br: bufio.BufferReader
  readonly bufferLength

  constructor(requestBody: Buffer) {
    this.br = bufio.read(requestBody)
    this.bufferLength = requestBody.length
  }

  static serialize(options: UnboxMessageRequest): Buffer {
    const bw = bufio.write()
    bw.writeBytes(Buffer.from(options.sender))
    bw.writeBytes(Buffer.from(options.recipient.publicKey))
    bw.writeBytes(Buffer.from(options.recipient.secretKey))
    bw.writeBytes(Buffer.from(options.nonce))
    bw.writeBytes(Buffer.from(options.boxedMessage))
    return bw.render()
  }

  sender(): Identity {
    this.br.offset = 0
    return this.br.readBytes(IDENTITY_BYTE_LENGTH).toString()
  }

  recipient(): PrivateIdentity {
    this.br.offset = IDENTITY_BYTE_LENGTH
    const publicKey = Uint8Array.from(this.br.readBytes(PUBLIC_KEY_BYTE_LENGTH))
    const secretKey = Uint8Array.from(this.br.readBytes(SECRET_KEY_BYTE_LENGTH))
    return { publicKey, secretKey }
  }

  nonce(): string {
    this.br.offset = IDENTITY_BYTE_LENGTH + PUBLIC_KEY_BYTE_LENGTH + SECRET_KEY_BYTE_LENGTH
    return this.br.readBytes(NONCE_BYTE_LENGTH).toString()
  }

  boxedMessage(): string {
    this.br.offset =
      IDENTITY_BYTE_LENGTH + PUBLIC_KEY_BYTE_LENGTH + SECRET_KEY_BYTE_LENGTH + NONCE_BYTE_LENGTH
    const boxedMessageLength = this.bufferLength - this.br.offset
    return this.br.readBytes(boxedMessageLength).toString()
  }
}

export class UnboxMessageResp {
  readonly br: bufio.BufferReader
  readonly bufferLength: number

  constructor(responseBody: Buffer) {
    this.br = bufio.read(responseBody)
    this.bufferLength = responseBody.length
  }

  static serialize(options: UnboxMessageResponse): Buffer {
    const bw = bufio.write()
    if (options.message) {
      bw.writeBytes(Buffer.from(options.message))
    }

    return bw.render()
  }

  deserialize(): UnboxMessageResponse {
    let message = null

    try {
      const messageLength = this.bufferLength - this.br.offset
      message = this.br.readBytes(messageLength).toString('utf8')
    } catch (error) {
      message = null
    }

    return { message }
  }

  message(): string | null {
    let message = null
    this.br.offset = 0
    try {
      const messageLength = this.bufferLength - this.br.offset
      message = this.br.readBytes(messageLength).toString('utf8')
    } catch (error) {
      message = null
    }

    return message
  }
}

export function handleUnboxMessage(requestBody: Buffer): {
  responseType: WorkerMessageType
  response: Buffer
} {
  const request = new UnboxMessageReq(requestBody)
  const result = unboxMessage(
    request.boxedMessage(),
    request.nonce(),
    request.sender(),
    request.recipient(),
  )

  return {
    responseType: WorkerMessageType.unboxMessage,
    response: UnboxMessageResp.serialize({
      message: result === null ? null : Buffer.from(result).toString('utf8'),
    }),
  }
}
