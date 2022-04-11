/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { Identity } from '../identity'
import { NetworkMessage, NetworkMessageType } from './networkMessage'

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

  serialize(): Buffer {
    const bw = bufio.write()
    bw.writeVarString(this.destinationIdentity)
    bw.writeVarString(this.sourceIdentity)
    bw.writeVarString(this.nonce)
    bw.writeVarString(this.signal)
    return bw.render()
  }

  static deserialize(buffer: Buffer): SignalMessage {
    const reader = bufio.read(buffer, true)
    const destinationIdentity = reader.readVarString()
    const sourceIdentity = reader.readVarString()
    const nonce = reader.readVarString()
    const signal = reader.readVarString()
    return new SignalMessage({
      destinationIdentity,
      sourceIdentity,
      nonce,
      signal,
    })
  }
}
