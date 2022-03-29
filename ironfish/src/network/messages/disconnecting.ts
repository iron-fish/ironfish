/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { Identity } from '../identity'
import { NetworkMessage, NetworkMessageType } from './networkMessage'

export enum DisconnectingReason {
  ShuttingDown = 0,
  Congested = 1,
}

interface CreateDisconnectingMessageOptions {
  // Can be null if we're sending the message to an unidentified Peer
  destinationIdentity: Identity | null
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

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    bw.writeU64(this.disconnectUntil)
    bw.writeU8(this.reason)
    bw.writeVarString(this.sourceIdentity)
    if (this.destinationIdentity) {
      bw.writeVarString(this.destinationIdentity)
    }
    return bw.render()
  }

  static deserialize(buffer: Buffer): DisconnectingMessage {
    const reader = bufio.read(buffer, true)
    const disconnectUntil = reader.readU64()
    const reason = reader.readU8()
    const sourceIdentity = reader.readVarString()
    let destinationIdentity = null
    if (reader.left()) {
      destinationIdentity = reader.readVarString()
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
    size += 8
    size += 1
    size += bufio.sizeVarString(this.sourceIdentity)
    if (this.destinationIdentity) {
      size += bufio.sizeVarString(this.destinationIdentity)
    }
    return size
  }
}
