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
    const bw = bufio.write(212)
    bw.writeU32(header.sequence)
    bw.writeHash(header.previousBlockHash)
    bw.writeHash(header.noteCommitment)
    bw.writeHash(header.nullifierCommitment.commitment)
    // TODO: change commitment size to u32. tree_size on spend proofs is
    // a u32, and our merkle trees have depth of 32.
    bw.writeU64(header.nullifierCommitment.size)
    bw.writeHash(header.transactionCommitment)
    // TODO: Change to little-endian for consistency, since other non-bigint numbers are serialized as little-endian.
    bw.writeBytes(BigIntUtils.toBytesBE(header.target.asBigInt(), 32))
    bw.writeU64(header.timestamp.getTime())
    bw.writeBytes(header.graffiti)
    return bw.render()
  }

  static deserialize(data: Buffer): PartialBlockHeader {
    const br = bufio.read(data)
    const sequence = br.readU32()
    const previousBlockHash = br.readHash()
    const noteCommitment = br.readHash()
    const nullifierCommitment = br.readHash()
    const nullifierCommitmentSize = br.readU64()
    const transactionCommitment = br.readHash()
    const target = br.readBytes(32)
    const timestamp = br.readU64()
    const graffiti = br.readBytes(32)

    return {
      sequence: sequence,
      previousBlockHash: previousBlockHash,
      target: new Target(target),
      timestamp: new Date(timestamp),
      graffiti: graffiti,
      noteCommitment: noteCommitment,
      nullifierCommitment: {
        commitment: nullifierCommitment,
        size: nullifierCommitmentSize,
      },
      transactionCommitment,
    }
  }

  static equals(): boolean {
    throw new Error('You should never use this')
  }
}

export type PartialBlockHeader = {
  sequence: number
  previousBlockHash: Buffer
  noteCommitment: NoteEncryptedHash
  nullifierCommitment: {
    commitment: NullifierHash
    size: number
  }
  transactionCommitment: Buffer
  target: Target
  timestamp: Date
  graffiti: Buffer
}
