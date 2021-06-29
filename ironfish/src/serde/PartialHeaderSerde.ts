/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { NullifierHash } from '../primitives/nullifier'
import { Target, TargetSerdeInstance } from '../primitives/target'
import { Transaction } from '../primitives/transaction'
import { Strategy } from '../strategy'
import Serde, {
  BlockHashSerdeInstance,
  GraffitiSerdeInstance,
  IJSON,
  JsonSerializable,
} from '.'

export default class PartialBlockHeaderSerde<
  E,
  H,
  T extends Transaction<E, H>,
  SE extends JsonSerializable,
  SH extends JsonSerializable,
  ST,
> implements Serde<PartialBlockHeader<E, H, T, SE, SH, ST>, Buffer>
{
  strategy: Strategy<E, H, T, SE, SH, ST>

  constructor(strategy: Strategy<E, H, T, SE, SH, ST>) {
    this.strategy = strategy
  }

  serialize(header: PartialBlockHeader<E, H, T, SE, SH, ST>): Buffer {
    // WHAT EVER YOU DO DO NOT REORDER THE KEYS IN THIS OBJECT
    // It will cause ALL block hashes to change. Yes that is
    // absolutely aweful, and we will fix it.

    const serialized: SerializedPartialBlockHeader<E, H, T, SE, SH, ST> = {
      height: header.height,
      previousBlockHash: BlockHashSerdeInstance.serialize(header.previousBlockHash),
      noteCommitment: {
        commitment: this.strategy
          .noteHasher()
          .hashSerde()
          .serialize(header.noteCommitment.commitment),
        size: header.noteCommitment.size,
      },
      nullifierCommitment: {
        commitment: this.strategy
          .nullifierHasher()
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

  deserialize(data: Buffer): PartialBlockHeader<E, H, T, SE, SH, ST> {
    const deserialized = IJSON.parse(data.toString()) as SerializedPartialBlockHeader<
      E,
      H,
      T,
      SE,
      SH,
      ST
    >

    return {
      height: deserialized.height,
      previousBlockHash: BlockHashSerdeInstance.deserialize(deserialized.previousBlockHash),
      target: TargetSerdeInstance.deserialize(deserialized.target),
      timestamp: new Date(deserialized.timestamp),
      minersFee: BigInt(deserialized.minersFee),
      graffiti: GraffitiSerdeInstance.deserialize(deserialized.graffiti),
      noteCommitment: {
        commitment: this.strategy
          .noteHasher()
          .hashSerde()
          .deserialize(deserialized.noteCommitment.commitment),
        size: deserialized.noteCommitment.size,
      },
      nullifierCommitment: {
        commitment: this.strategy
          .nullifierHasher()
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

type PartialBlockHeader<
  E,
  H,
  _T extends Transaction<E, H>,
  _SE extends JsonSerializable,
  _SH extends JsonSerializable,
  _ST,
> = {
  height: number
  previousBlockHash: Buffer
  noteCommitment: {
    commitment: H
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

type SerializedPartialBlockHeader<
  E,
  H,
  _T extends Transaction<E, H>,
  _SE extends JsonSerializable,
  SH extends JsonSerializable,
  _ST,
> = {
  height: string
  previousBlockHash: string
  target: string
  timestamp: number
  minersFee: string
  graffiti: string
  noteCommitment: {
    commitment: SH
    size: number
  }
  nullifierCommitment: {
    commitment: string
    size: number
  }
}
