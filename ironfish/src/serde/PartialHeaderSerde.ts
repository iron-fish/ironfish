/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import bufio from 'bufio'
import { NoteEncryptedHash } from '../primitives/noteEncrypted'
import { NullifierHash } from '../primitives/nullifier'
import { Target } from '../primitives/target'
import { BigIntUtils } from '../utils'

export default class PartialBlockHeaderSerde {
  static serialize(header: PartialBlockHeader): Buffer {
    const bw = bufio.write(184)
    bw.writeHash(header.previousBlockHash)
    bw.writeHash(header.noteCommitment.commitment)
    // TODO: change commitment size to u32. tree_size on spend proofs is
    // a u32, and our merkle trees have depth of 32.
    bw.writeU64(header.noteCommitment.size)
    bw.writeHash(header.nullifierCommitment.commitment)
    // TODO: change commitment size to u32. tree_size on spend proofs is
    // a u32, and our merkle trees have depth of 32.
    bw.writeU64(header.nullifierCommitment.size)
    // TODO: Change to little-endian for consistency, since other non-bigint numbers are serialized as little-endian.
    bw.writeBytes(BigIntUtils.toBytesBE(header.target.asBigInt(), 32))
    bw.writeU64(header.timestamp.getTime())
    bw.writeBytes(header.graffiti)
    return bw.render()
  }

  static deserialize(data: Buffer): PartialBlockHeader {
    const br = bufio.read(data)
    const previousBlockHash = br.readHash()
    const noteCommitment = br.readHash()
    const noteCommitmentSize = br.readU64()
    const nullifierCommitment = br.readHash()
    const nullifierCommitmentSize = br.readU64()
    const target = br.readBytes(32)
    const timestamp = br.readU64()
    const graffiti = br.readBytes(32)

    return {
      previousBlockHash: previousBlockHash,
      target: new Target(target),
      timestamp: new Date(timestamp),
      graffiti: graffiti,
      noteCommitment: {
        commitment: noteCommitment,
        size: noteCommitmentSize,
      },
      nullifierCommitment: {
        commitment: nullifierCommitment,
        size: nullifierCommitmentSize,
      },
    }
  }

  static equals(): boolean {
    throw new Error('You should never use this')
  }
}

export type PartialBlockHeader = {
  previousBlockHash: Buffer
  noteCommitment: {
    commitment: NoteEncryptedHash
    size: number
  }
  nullifierCommitment: {
    commitment: NullifierHash
    size: number
  }
  target: Target
  timestamp: Date
  graffiti: Buffer
}
