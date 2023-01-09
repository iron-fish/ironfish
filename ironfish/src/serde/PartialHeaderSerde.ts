/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import bufio from 'bufio'
import { NoteEncryptedHash } from '../primitives/noteEncrypted'
import { Target } from '../primitives/target'

export default class PartialBlockHeaderSerde {
  static serialize(header: PartialBlockHeader): Buffer {
    const bw = bufio.write(172)
    bw.writeU32(header.sequence)
    bw.writeHash(header.previousBlockHash)
    bw.writeHash(header.noteCommitment)
    bw.writeHash(header.transactionCommitment)
    bw.writeBigU256BE(header.target.asBigInt())
    bw.writeU64(header.timestamp.getTime())
    bw.writeBytes(header.graffiti)
    return bw.render()
  }

  static deserialize(data: Buffer): PartialBlockHeader {
    const br = bufio.read(data)
    const sequence = br.readU32()
    const previousBlockHash = br.readHash()
    const noteCommitment = br.readHash()
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
  transactionCommitment: Buffer
  target: Target
  timestamp: Date
  graffiti: Buffer
}
