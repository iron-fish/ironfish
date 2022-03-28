/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { Identity } from '../identity'
import { NetworkMessage, NetworkMessageType } from './networkMessage'

interface CreateIdentifyMessageOptions {
  agent: string
  head: string
  identity: Identity
  name?: string
  port: number | null
  sequence: number
  version: number
  work: string
}

export class IdentifyMessage extends NetworkMessage {
  readonly agent: string
  readonly head: string
  readonly identity: Identity
  readonly name: string
  readonly port: number
  readonly sequence: number
  readonly version: number
  readonly work: string

  constructor({
    agent,
    head,
    identity,
    name,
    port,
    sequence,
    version,
    work,
  }: CreateIdentifyMessageOptions) {
    super(NetworkMessageType.Identify)
    this.agent = agent
    this.head = head
    this.identity = identity
    this.name = name || ''
    this.port = port || 0
    this.sequence = sequence
    this.version = version
    this.work = work
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    bw.writeVarString(this.agent)
    bw.writeVarString(this.head)
    bw.writeVarString(this.identity)
    bw.writeVarString(this.name)
    bw.writeU64(this.port)
    bw.writeU64(this.sequence)
    bw.writeU64(this.version)
    bw.writeVarString(this.work)
    return bw.render()
  }

  static deserialize(buffer: Buffer): IdentifyMessage {
    const reader = bufio.read(buffer, true)
    const agent = reader.readVarString()
    const head = reader.readVarString()
    const identity = reader.readVarString()
    const name = reader.readVarString()
    const port = reader.readU64()
    const sequence = reader.readU64()
    const version = reader.readU64()
    const work = reader.readVarString()
    return new IdentifyMessage({
      agent,
      head,
      identity,
      name,
      port,
      sequence,
      version,
      work,
    })
  }

  getSize(): number {
    let size = 0
    size += bufio.sizeVarString(this.agent)
    size += bufio.sizeVarString(this.head)
    size += bufio.sizeVarString(this.identity)
    size += bufio.sizeVarString(this.name)
    size += 24
    size += bufio.sizeVarString(this.work)
    return size
  }
}
