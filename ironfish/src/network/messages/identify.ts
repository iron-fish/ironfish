/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { BigIntUtils } from '../../utils/bigint'
import { Identity, identityLength } from '../identity'
import { NetworkMessageType } from '../types'
import { NetworkMessage } from './networkMessage'

export const SUB_PROTOCOLS_MIN_VERSION = 21

interface CreateIdentifyMessageOptions {
  agent: string
  head: Buffer
  identity: Identity
  name?: string
  port: number | null
  sequence: number
  version: number
  work: bigint
  networkId: number
  genesisBlockHash: Buffer
  subProtocols: Map<number, number>
}

export class IdentifyMessage extends NetworkMessage {
  readonly agent: string
  readonly head: Buffer
  readonly identity: Identity
  readonly name: string
  readonly port: number
  readonly sequence: number
  readonly version: number
  readonly work: bigint
  readonly networkId: number
  readonly genesisBlockHash: Buffer
  /**
   * Map of sub-protocol ID to sub-protocol version.
   */
  readonly subProtocols: Map<number, number>

  constructor({
    agent,
    head,
    identity,
    name,
    port,
    sequence,
    version,
    work,
    networkId,
    genesisBlockHash,
    subProtocols,
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
    this.networkId = networkId
    this.genesisBlockHash = genesisBlockHash
    this.subProtocols = subProtocols
  }

  serialize(): Buffer {
    const bw = bufio.write(this.getSize())
    bw.writeBytes(Buffer.from(this.identity, 'base64'))
    bw.writeVarString(this.name, 'utf8')
    bw.writeU16(this.port)
    bw.writeU16(this.version)
    bw.writeVarString(this.agent, 'utf8')
    bw.writeU32(this.sequence)
    bw.writeHash(this.head)
    bw.writeVarBytes(BigIntUtils.toBytesLE(this.work))
    bw.writeU16(this.networkId)
    bw.writeHash(this.genesisBlockHash)

    bw.writeU16(this.subProtocols.size)
    for (const [id, version] of this.subProtocols) {
      bw.writeU8(id)
      bw.writeU16(version)
    }

    return bw.render()
  }

  static deserialize(buffer: Buffer): IdentifyMessage {
    const reader = bufio.read(buffer, true)
    const identity = reader.readBytes(identityLength).toString('base64')
    const name = reader.readVarString('utf8')
    const port = reader.readU16()
    const version = reader.readU16()
    const agent = reader.readVarString('utf8')
    const sequence = reader.readU32()
    const head = reader.readHash()
    const work = BigIntUtils.fromBytesLE(reader.readVarBytes())
    const networkId = reader.readU16()
    const genesisBlockHash = reader.readHash()

    const subProtocols = new Map<number, number>()
    if (version >= SUB_PROTOCOLS_MIN_VERSION) {
      const subProtocolsLength = reader.readU16()
      for (let i = 0; i < subProtocolsLength; i++) {
        const id = reader.readU8()
        const version = reader.readU16()
        subProtocols.set(id, version)
      }
    }

    return new IdentifyMessage({
      agent,
      head,
      identity,
      name,
      port,
      sequence,
      version,
      work,
      networkId,
      genesisBlockHash,
      subProtocols,
    })
  }

  getSize(): number {
    let size = 0
    size += identityLength
    size += bufio.sizeVarString(this.name, 'utf8')
    size += 2 // port
    size += 2 // version
    size += bufio.sizeVarString(this.agent, 'utf8')
    size += 4 // sequence
    size += 32 // head
    size += bufio.sizeVarBytes(BigIntUtils.toBytesLE(this.work))
    size += 2 // network ID
    size += 32 // genesis block hash
    size += 2 // sub-protocol length
    size += 3 * this.subProtocols.size // ID + version * size
    return size
  }
}
