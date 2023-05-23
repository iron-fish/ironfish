/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { Assert } from '../../assert'
import { identityLength } from '../identity'
import { NetworkMessageType } from '../types'
import { NetworkMessage } from './networkMessage'

export interface Peer {
  identity: Buffer
  name?: string
  address: string | null
  port: number | null
}

export class PeerListMessage extends NetworkMessage {
  readonly connectedPeers: Peer[]

  constructor(connectedPeers: Peer[]) {
    super(NetworkMessageType.PeerList)
    this.connectedPeers = connectedPeers
  }

  serializePayload(bw: bufio.StaticWriter | bufio.BufferWriter): void {
    bw.writeU16(this.connectedPeers.length)

    for (const peer of this.connectedPeers) {
      const { identity, name, address, port } = peer

      Assert.isEqual(identity.byteLength, identityLength)
      bw.writeBytes(identity)

      let flags = 0
      flags |= Number(!!name) << 0
      flags |= Number(!!port) << 1
      flags |= Number(!!address) << 2
      bw.writeU8(flags)

      if (name) {
        bw.writeVarString(name, 'utf8')
      }

      if (port) {
        bw.writeU16(port)
      }

      if (address) {
        bw.writeVarString(address, 'utf8')
      }
    }
  }

  static deserializePayload(buffer: Buffer): PeerListMessage {
    const reader = bufio.read(buffer, true)
    const connectedPeersLength = reader.readU16()
    const connectedPeers = []

    for (let i = 0; i < connectedPeersLength; i++) {
      const identity = reader.readBytes(identityLength)

      const flags = reader.readU8()
      const hasName = flags & (1 << 0)
      const hasPort = flags & (1 << 1)
      const hasAddress = flags & (1 << 2)

      let name = undefined
      if (hasName) {
        name = reader.readVarString('utf8')
      }

      let port = null
      if (hasPort) {
        port = reader.readU16()
      }

      let address = null
      if (hasAddress) {
        address = reader.readVarString('utf8')
      }

      connectedPeers.push({
        identity,
        name,
        address,
        port,
      })
    }
    return new PeerListMessage(connectedPeers)
  }

  getSize(): number {
    let size = 2

    for (const { name, address, port } of this.connectedPeers) {
      size += identityLength

      size += 1
      if (name) {
        size += bufio.sizeVarString(name, 'utf8')
      }

      if (port) {
        size += 2
      }

      if (address) {
        size += bufio.sizeVarString(address, 'utf8')
      }
    }
    return size
  }
}
