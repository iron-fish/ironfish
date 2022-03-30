/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { Identity } from '../identity'
import { NetworkMessage, NetworkMessageType } from './networkMessage'

interface Peer {
  identity: Identity
  name?: string
  address: string | null
  port: number | null
}

export class PeerListMessage extends NetworkMessage {
  readonly connectedPeers: Peer[]

  constructor(connectedPeers: Peer[]) {
    super(NetworkMessageType.Signal)
    this.connectedPeers = connectedPeers
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    bw.writeU64(this.connectedPeers.length)

    for (const peer of this.connectedPeers) {
      const { identity, name, address, port } = peer
      bw.writeVarString(identity)

      if (name) {
        bw.writeU8(1)
        bw.writeVarString(name)
      } else {
        bw.writeU8(0)
      }

      if (address) {
        bw.writeU8(1)
        bw.writeVarString(address)
      } else {
        bw.writeU8(0)
      }

      if (port) {
        bw.writeU8(1)
        bw.writeU64(port)
      } else {
        bw.writeU8(0)
      }
    }
    return bw.render()
  }

  static deserialize(buffer: Buffer): PeerListMessage {
    const reader = bufio.read(buffer, true)
    const connectedPeersLength = reader.readU64()
    const connectedPeers = []

    for (let i = 0; i < connectedPeersLength; i++) {
      const identity = reader.readVarString()

      const hasName = reader.readU8()
      let name = undefined
      if (hasName) {
        name = reader.readVarString()
      }

      const hasAddress = reader.readU8()
      let address = null
      if (hasAddress) {
        address = reader.readVarString()
      }

      const hasPort = reader.readU8()
      let port = null
      if (hasPort) {
        port = reader.readU64()
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
    let size = 8

    for (const { identity, name, address, port } of this.connectedPeers) {
      size += bufio.sizeVarString(identity)

      size += 1
      if (name) {
        size += bufio.sizeVarString(name)
      }

      size += 1
      if (address) {
        size += bufio.sizeVarString(address)
      }

      size += 1
      if (port) {
        size += 8
      }
    }
    return size
  }
}
