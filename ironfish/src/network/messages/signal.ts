/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NONCE_LENGTH } from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { Identity, identityLength } from '../identity'
import { NetworkMessageType } from '../types'
import { NetworkMessage } from './networkMessage'

interface CreateSignalMessageOptions {
  destinationIdentity: Identity
  sourceIdentity: Identity
  nonce: string
  signal: string
}

/**
 * A message used to signal an rtc session between two peers.
 *
 * The referring peer will forward the message to the sourceIdentity,
 * which will need to respond with a signal that has peer and source
 * inverted.
 */
export class SignalMessage extends NetworkMessage {
  readonly sourceIdentity: Identity
  readonly destinationIdentity: Identity
  readonly nonce: string
  readonly signal: string

  constructor({
    destinationIdentity,
    sourceIdentity,
    nonce,
    signal,
  }: CreateSignalMessageOptions) {
    super(NetworkMessageType.Signal)
    this.destinationIdentity = destinationIdentity
    this.sourceIdentity = sourceIdentity
    this.nonce = nonce
    this.signal = signal
  }

  serializePayload(bw: bufio.StaticWriter | bufio.BufferWriter): void {
    bw.writeBytes(Buffer.from(this.destinationIdentity, 'base64'))
    bw.writeBytes(Buffer.from(this.sourceIdentity, 'base64'))
    bw.writeBytes(Buffer.from(this.nonce, 'base64'))
    bw.writeBytes(Buffer.from(this.signal, 'base64'))
  }

  static deserializePayload(buffer: Buffer): SignalMessage {
    const reader = bufio.read(buffer, true)
    const destinationIdentity = reader.readBytes(identityLength).toString('base64')
    const sourceIdentity = reader.readBytes(identityLength).toString('base64')
    const nonce = reader.readBytes(NONCE_LENGTH).toString('base64')
    const signal = reader.readBytes(reader.left()).toString('base64')
    return new SignalMessage({
      destinationIdentity,
      sourceIdentity,
      nonce,
      signal,
    })
  }

  getSize(): number {
    return (
      identityLength + identityLength + NONCE_LENGTH + Buffer.byteLength(this.signal, 'base64')
    )
  }
}
