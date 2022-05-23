/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { IDatabaseEncoding } from '../../storage/database/types'
import bufio from 'bufio'
import { Assert } from '../../assert'
import { BlockHeader } from '../../primitives/blockheader'
import { Target } from '../../primitives/target'
import { Strategy } from '../../strategy'
import { BigIntUtils } from '../../utils/bigint'

export type HeaderValue = {
  header: BlockHeader
}

export class HeaderEncoding implements IDatabaseEncoding<HeaderValue> {
  constructor(readonly strategy: Strategy) {}

  serialize(value: HeaderValue): Buffer {
    const bw = bufio.write(this.getSize(value))

    bw.writeU32(value.header.sequence)
    bw.writeHash(value.header.previousBlockHash)
    bw.writeHash(value.header.noteCommitment.commitment)
    bw.writeU32(value.header.noteCommitment.size)
    bw.writeHash(value.header.nullifierCommitment.commitment)
    bw.writeU32(value.header.nullifierCommitment.size)
    bw.writeBytes(BigIntUtils.toBytesLE(value.header.target.asBigInt(), 32))
    bw.writeBytes(BigIntUtils.toBytesLE(value.header.randomness, 8))
    bw.writeU64(value.header.timestamp.getTime())

    Assert.isTrue(value.header.minersFee <= 0)
    bw.writeBytes(BigIntUtils.toBytesLE(-value.header.minersFee, 8))

    bw.writeBytes(value.header.graffiti)
    bw.writeVarBytes(BigIntUtils.toBytesLE(value.header.work))
    bw.writeHash(value.header.hash)

    return bw.render()
  }

  deserialize(data: Buffer): HeaderValue {
    const reader = bufio.read(data, true)

    const sequence = reader.readU32()
    const previousBlockHash = reader.readHash()
    const noteCommitment = reader.readHash()
    const noteCommitmentSize = reader.readU32()
    const nullifierCommitment = reader.readHash()
    const nullifierCommitmentSize = reader.readU32()
    const target = new Target(BigIntUtils.fromBytesLE(reader.readBytes(32)))
    const randomness = BigIntUtils.fromBytesLE(reader.readBytes(8))
    const timestamp = reader.readU64()
    const minersFee = -BigIntUtils.fromBytesLE(reader.readBytes(8))
    const graffiti = reader.readBytes(32)
    const work = BigIntUtils.fromBytesLE(reader.readVarBytes())
    const hash = reader.readHash()

    const header = new BlockHeader(
      this.strategy,
      sequence,
      previousBlockHash,
      {
        commitment: noteCommitment,
        size: noteCommitmentSize,
      },
      {
        commitment: nullifierCommitment,
        size: nullifierCommitmentSize,
      },
      target,
      randomness,
      new Date(timestamp),
      minersFee,
      graffiti,
      work,
      hash,
    )

    return { header }
  }

  getSize(value: HeaderValue): number {
    let size = 0
    size += 4 // sequence
    size += 32 // previousBlockHash
    size += 32 // noteCommitment.commitment
    size += 4 // noteCommitment.size
    size += 32 // nullifierCommitment.commitment
    size += 4 // nullifierCommitment.size
    size += 32 // target
    size += 8 // randomness
    size += 8 // timestamp
    size += 8 // minersFee
    size += 32 // graffiti
    size += bufio.sizeVarBytes(BigIntUtils.toBytesLE(value.header.work))
    size += 32 // hash

    return size
  }
}
