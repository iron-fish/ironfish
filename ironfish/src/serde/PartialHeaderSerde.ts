/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as bufio from '@bitrelay/bufio'
import { WasmNoteEncryptedHash } from '../primitives/noteEncrypted'
import { NullifierHash } from '../primitives/nullifier'
import { Target, TargetSerdeInstance } from '../primitives/target'
import { Strategy } from '../strategy'
import { BlockHashSerdeInstance, GraffitiSerdeInstance, Serde } from '.'

export default class PartialBlockHeaderSerde implements Serde<PartialBlockHeader, Buffer> {
  strategy: Strategy

  constructor(strategy: Strategy) {
    this.strategy = strategy
  }

  serialize(header: PartialBlockHeader): Buffer {
    // WHAT EVER YOU DO DO NOT REORDER THE KEYS IN THIS OBJECT
    // It will cause ALL block hashes to change. Yes that is
    // absolutely aweful, and we will fix it.

    const bw = bufio.write()
    bw.writeU64(header.sequence)
    bw.writeVarString(BlockHashSerdeInstance.serialize(header.previousBlockHash))
    bw.writeVarBytes(
      this.strategy.noteHasher.hashSerde().serialize(header.noteCommitment.commitment),
    )
    bw.writeU64(header.noteCommitment.size)
    bw.writeVarString(
      this.strategy.nullifierHasher
        .hashSerde()
        .serialize(header.nullifierCommitment.commitment),
    )
    bw.writeU64(header.nullifierCommitment.size)
    bw.writeVarString(TargetSerdeInstance.serialize(header.target))
    bw.writeU64(header.timestamp.getTime())
    bw.writeVarString(header.minersFee.toString())
    bw.writeVarString(GraffitiSerdeInstance.serialize(header.graffiti))

    /*    const serialized: SerializedPartialBlockHeader = {
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

    return Buffer.from(IJSON.stringify(serialized))*/
    return bw.render()
  }

  deserialize(data: Buffer): PartialBlockHeader {
    const br = bufio.read(data)
    const sequence = br.readU64()
    const previousBlockHash = br.readVarString()
    const commitment = br.readVarBytes()
    const noteCommitmentSize = br.readU64()
    const nullifierCommitment = br.readVarString()
    const nullifierCommitmentSize = br.readU64()
    const target = br.readVarString()
    const timestamp = br.readU64()
    const minersFee = br.readVarString()
    const graffiti = br.readVarString()
    return {
      sequence: Number(sequence),
      previousBlockHash: BlockHashSerdeInstance.deserialize(previousBlockHash),
      target: TargetSerdeInstance.deserialize(target),
      timestamp: new Date(timestamp),
      minersFee: BigInt(minersFee),
      graffiti: GraffitiSerdeInstance.deserialize(graffiti),
      noteCommitment: {
        commitment: this.strategy.noteHasher.hashSerde().deserialize(commitment),
        size: noteCommitmentSize,
      },
      nullifierCommitment: {
        commitment: this.strategy.nullifierHasher.hashSerde().deserialize(nullifierCommitment),
        size: nullifierCommitmentSize,
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
    commitment: WasmNoteEncryptedHash
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

/*type SerializedPartialBlockHeader = {
  sequence: string
  previousBlockHash: string
  target: string
  timestamp: number
  minersFee: string
  graffiti: string
  noteCommitment: {
    commitment: SerializedWasmNoteEncryptedHash
    size: number
  }
  nullifierCommitment: {
    commitment: string
    size: number
  }
}
*/
