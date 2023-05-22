/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { Identity, identityLength } from '../identity'
import { NetworkMessageType } from '../types'
import { NetworkMessage } from './networkMessage'

interface CreateSignalRequestMessageOptions {
  destinationIdentity: Identity
  sourceIdentity: Identity
}

/**
 * A message used to indicate to a peer that we want them to
 * initiate signaling with us. This is most often used when
 * we discover a peer through another peer but need to indicate
 * to them through a brokering peer to connect to us via webrtc.
 */
export class SignalRequestMessage extends NetworkMessage {
  readonly sourceIdentity: Identity
  readonly destinationIdentity: Identity

  constructor({ destinationIdentity, sourceIdentity }: CreateSignalRequestMessageOptions) {
    super(NetworkMessageType.SignalRequest)
    this.destinationIdentity = destinationIdentity
    this.sourceIdentity = sourceIdentity
  }

  serializePayload(bw: bufio.StaticWriter | bufio.BufferWriter): void {
    bw.writeBytes(Buffer.from(this.destinationIdentity, 'base64'))
    bw.writeBytes(Buffer.from(this.sourceIdentity, 'base64'))
  }

  static deserializePayload(buffer: Buffer): SignalRequestMessage {
    const reader = bufio.read(buffer, true)
    const destinationIdentity = reader.readBytes(identityLength).toString('base64')
    const sourceIdentity = reader.readBytes(identityLength).toString('base64')
    return new SignalRequestMessage({
      destinationIdentity,
      sourceIdentity,
    })
  }

  getSize(): number {
    return identityLength * 2
  }
}
