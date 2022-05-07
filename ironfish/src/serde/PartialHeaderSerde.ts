/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import bufio from 'bufio'
import { NoteEncryptedHash } from '../primitives/noteEncrypted'
import { NullifierHash } from '../primitives/nullifier'
import { Target } from '../primitives/target'
import { BigIntUtils } from '../utils'
import { Serde } from './Serde'

export default class PartialBlockHeaderSerde implements Serde<PartialBlockHeader, Buffer> {
  serialize(header: PartialBlockHeader): Buffer {
    const bw = bufio.write(200)
    // TODO: change sequence to u32. expiration_sequence is u32 on transactions, and we're not
    // likely to overflow for a long time.
    bw.writeU64(header.sequence)
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
    // TODO: Change to little-endian for consistency, since other non-bigint numbers are serialized as little-endian.
    bw.writeBytes(BigIntUtils.toBytesBE(header.minersFee, 8))
    bw.writeBytes(header.graffiti)
    return bw.render()
  }

  deserialize(data: Buffer): PartialBlockHeader {
    const br = bufio.read(data)
    const sequence = br.readU64()
    const previousBlockHash = br.readHash()
    const noteCommitment = br.readHash()
    const noteCommitmentSize = br.readU64()
    const nullifierCommitment = br.readHash()
    const nullifierCommitmentSize = br.readU64()
    const target = br.readBytes(32)
    const timestamp = br.readU64()
    const minersFee = br.readBytes(8)
    const graffiti = br.readBytes(32)

    return {
      sequence: sequence,
      previousBlockHash: previousBlockHash,
      target: new Target(target),
      timestamp: new Date(timestamp),
      minersFee: BigIntUtils.fromBytes(minersFee),
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

  equals(): boolean {
    throw new Error('You should never use this')
  }
}

export type PartialBlockHeader = {
  sequence: number
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
  minersFee: bigint
  graffiti: Buffer
}
