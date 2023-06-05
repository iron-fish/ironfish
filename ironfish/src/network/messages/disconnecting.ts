/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { Identity, identityLength } from '../identity'
import { NetworkMessageType } from '../types'
import { NetworkMessage } from './networkMessage'

export enum DisconnectingReason {
  ShuttingDown = 0,
  Congested = 1,
  BadMessages = 2,
}

interface CreateDisconnectingMessageOptions {
  // Can be null if we're sending the message to an unidentified Peer
  destinationIdentity: Identity | null
  // Expects a timestamp with millisecond precision
  disconnectUntil: number
  reason: DisconnectingReason
  sourceIdentity: Identity
}

export class DisconnectingMessage extends NetworkMessage {
  readonly destinationIdentity: Identity | null
  readonly disconnectUntil: number
  readonly reason: DisconnectingReason
  readonly sourceIdentity: Identity

  constructor({
    destinationIdentity,
    disconnectUntil,
    reason,
    sourceIdentity,
  }: CreateDisconnectingMessageOptions) {
    super(NetworkMessageType.Disconnecting)
    this.destinationIdentity = destinationIdentity
    this.disconnectUntil = disconnectUntil
    this.reason = reason
    this.sourceIdentity = sourceIdentity
  }

  serializePayload(bw: bufio.StaticWriter | bufio.BufferWriter): void {
    // Truncates the timestamp to seconds
    bw.writeU32(Math.ceil(this.disconnectUntil / 1000))
    bw.writeU8(this.reason)
    bw.writeBytes(Buffer.from(this.sourceIdentity, 'base64'))
    if (this.destinationIdentity) {
      bw.writeBytes(Buffer.from(this.destinationIdentity, 'base64'))
    }
  }

  static deserializePayload(buffer: Buffer): DisconnectingMessage {
    const reader = bufio.read(buffer, true)
    const disconnectUntil = reader.readU32() * 1000
    const reason = reader.readU8()
    const sourceIdentity = reader.readBytes(identityLength).toString('base64')
    let destinationIdentity = null
    if (reader.left()) {
      destinationIdentity = reader.readBytes(identityLength).toString('base64')
    }
    return new DisconnectingMessage({
      destinationIdentity,
      disconnectUntil,
      reason,
      sourceIdentity,
    })
  }

  getSize(): number {
    let size = 0
    size += 4 // disconnectUntil
    size += 1 // reason
    size += identityLength
    if (this.destinationIdentity) {
      size += identityLength
    }
    return size
  }
}
