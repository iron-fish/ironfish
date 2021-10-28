/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import bufio from 'bufio'
import { NoteEncryptedHash } from '../primitives/noteEncrypted'
import { NullifierHash } from '../primitives/nullifier'
import { bigIntToBytes, bytesToBigInt, Target, TargetSerdeInstance } from '../primitives/target'
import { Strategy } from '../strategy'
import { Serde } from '.'

export default class PartialBlockHeaderSerde implements Serde<PartialBlockHeader, Buffer> {
  strategy: Strategy

  HASH_LENGTH = 32
  HEADER_SIZE = 200
  MINERS_FEE_BUFFER_SIZE = 8

  constructor(strategy: Strategy) {
    this.strategy = strategy
  }

  serialize(header: PartialBlockHeader): Buffer {
    // WHAT EVER YOU DO DO NOT REORDER THE KEYS IN THIS OBJECT
    // It will cause ALL block hashes to change. Yes that is
    // absolutely awful, and we will fix it.

    const bw = bufio.write(this.HEADER_SIZE)
    bw.writeU64(header.sequence)
    bw.writeBytes(header.previousBlockHash)
    bw.writeBytes(header.noteCommitment.commitment)
    bw.writeU64(header.noteCommitment.size)
    bw.writeBytes(header.nullifierCommitment.commitment)
    bw.writeU64(header.nullifierCommitment.size)
    bw.writeBytes(header.target.asBytes())
    bw.writeU64(header.timestamp.getTime())
    bw.writeBytes(this.minersFeeAsBytes(header.minersFee))
    bw.writeBytes(header.graffiti)
    return bw.render()
  }

  deserialize(data: Buffer): PartialBlockHeader {
    const br = bufio.read(data)
    const sequence = br.readU64()
    const previousBlockHash = br.readBytes(this.HASH_LENGTH)
    const commitment = br.readBytes(this.HASH_LENGTH)
    const noteCommitmentSize = br.readU64()
    const nullifierCommitment = br.readBytes(this.HASH_LENGTH)
    const nullifierCommitmentSize = br.readU64()
    const target = br.readBytes(this.HASH_LENGTH)
    const timestamp = br.readU64()
    const minersFee = bytesToBigInt(br.readBytes(this.MINERS_FEE_BUFFER_SIZE))
    const graffiti = br.readBytes(this.HASH_LENGTH)
    return {
      sequence: sequence,
      previousBlockHash: previousBlockHash,
      target: TargetSerdeInstance.deserialize(target),
      timestamp: new Date(timestamp),
      minersFee: BigInt(minersFee),
      graffiti: graffiti,
      noteCommitment: {
        commitment: commitment,
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

  minersFeeAsBytes(value: BigInt): Buffer {
    const bytes = bigIntToBytes(BigInt(value.toString()) * 1n)
    const result = Buffer.alloc(this.MINERS_FEE_BUFFER_SIZE)
    result.set(bytes, this.MINERS_FEE_BUFFER_SIZE - bytes.length)
    return result
  }
}

type PartialBlockHeader = {
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
  minersFee: BigInt
  graffiti: Buffer
}
