/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { NoteEncryptedHash, SerializedNoteEncryptedHash } from '../primitives/noteEncrypted'
import { NullifierHash } from '../primitives/nullifier'
import { Target, TargetSerdeInstance } from '../primitives/target'
import { Strategy } from '../strategy'
import { BlockHashSerdeInstance, GraffitiSerdeInstance, IJSON, Serde } from '.'

export default class PartialBlockHeaderSerde implements Serde<PartialBlockHeader, Buffer> {
  strategy: Strategy

  constructor(strategy: Strategy) {
    this.strategy = strategy
  }

  serialize(header: PartialBlockHeader): Buffer {
    // WHAT EVER YOU DO DO NOT REORDER THE KEYS IN THIS OBJECT
    // It will cause ALL block hashes to change. Yes that is
    // absolutely aweful, and we will fix it.

    const serialized: SerializedPartialBlockHeader = {
      sequence: header.sequence.toString(),
      previousBlockHash: BlockHashSerdeInstance.serialize(header.previousBlockHash),
      noteCommitment: {
        commitment: this.strategy.noteHasher
          .hashSerde()
          .serialize(header.noteCommitment.commitment),
        size: header.noteCommitment.size,
      },
      nullifierCommitment: {
        commitment: this.strategy.nullifierHasher
          .hashSerde()
          .serialize(header.nullifierCommitment.commitment),
        size: header.nullifierCommitment.size,
      },
      target: TargetSerdeInstance.serialize(header.target),
      timestamp: header.timestamp.getTime(),
      minersFee: header.minersFee.toString(),
      graffiti: GraffitiSerdeInstance.serialize(header.graffiti),
    }

    return Buffer.from(IJSON.stringify(serialized))
  }

  deserialize(data: Buffer): PartialBlockHeader {
    const deserialized = IJSON.parse(data.toString()) as SerializedPartialBlockHeader

    return {
      sequence: Number(deserialized.sequence),
      previousBlockHash: BlockHashSerdeInstance.deserialize(deserialized.previousBlockHash),
      target: TargetSerdeInstance.deserialize(deserialized.target),
      timestamp: new Date(deserialized.timestamp),
      minersFee: BigInt(deserialized.minersFee),
      graffiti: GraffitiSerdeInstance.deserialize(deserialized.graffiti),
      noteCommitment: {
        commitment: this.strategy.noteHasher
          .hashSerde()
          .deserialize(deserialized.noteCommitment.commitment),
        size: deserialized.noteCommitment.size,
      },
      nullifierCommitment: {
        commitment: this.strategy.nullifierHasher
          .hashSerde()
          .deserialize(deserialized.nullifierCommitment.commitment),
        size: deserialized.nullifierCommitment.size,
      },
    }
  }

  equals(): boolean {
    throw new Error('You should never use this')
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

type SerializedPartialBlockHeader = {
  sequence: string
  previousBlockHash: string
  target: string
  timestamp: number
  minersFee: string
  graffiti: string
  noteCommitment: {
    commitment: SerializedNoteEncryptedHash
    size: number
  }
  nullifierCommitment: {
    commitment: string
    size: number
  }
}
