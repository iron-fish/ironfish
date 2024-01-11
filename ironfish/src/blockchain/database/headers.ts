/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { IDatabaseEncoding } from '../../storage/database/types'
import bufio from 'bufio'
import { Assert } from '../../assert'
import { BlockHeader } from '../../primitives/blockheader'
import { Target } from '../../primitives/target'
import { BigIntUtils } from '../../utils/bigint'

export type HeaderValue = {
  header: BlockHeader
}

export class HeaderEncoding implements IDatabaseEncoding<HeaderValue> {
  serialize(value: HeaderValue): Buffer {
    Assert.isNotNull(
      value.header.noteSize,
      'The note tree size should be set on the block header before saving it to the database.',
    )

    const bw = bufio.write(this.getSize(value))

    bw.writeU32(value.header.sequence)
    bw.writeHash(value.header.previousBlockHash)
    bw.writeHash(value.header.noteCommitment)
    bw.writeU32(value.header.noteSize)
    bw.writeHash(value.header.transactionCommitment)
    bw.writeBigU256BE(value.header.target.asBigInt())
    bw.writeBigU64(value.header.randomness)
    bw.writeU64(value.header.timestamp.getTime())

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
    const noteSize = reader.readU32()
    const transactionCommitment = reader.readHash()
    const target = new Target(reader.readBigU256BE())
    const randomness = reader.readBigU64()
    const timestamp = reader.readU64()
    const graffiti = reader.readBytes(32)
    const work = BigIntUtils.fromBytesLE(reader.readVarBytes())
    const hash = reader.readHash()

    const rawHeader = {
      sequence,
      previousBlockHash,
      noteCommitment,
      transactionCommitment,
      target,
      randomness,
      timestamp: new Date(timestamp),
      graffiti,
    }
    const header = new BlockHeader(rawHeader, hash, noteSize, work)

    return { header }
  }

  getSize(value: HeaderValue): number {
    let size = 0
    size += 4 // sequence
    size += 32 // previousBlockHash
    size += 32 // noteCommitment
    size += 4 // noteSize
    size += 32 // transactionCommitment
    size += 32 // target
    size += 8 // randomness
    size += 8 // timestamp
    size += 32 // graffiti
    size += bufio.sizeVarBytes(BigIntUtils.toBytesLE(value.header.work))
    size += 32 // hash

    return size
  }
}
