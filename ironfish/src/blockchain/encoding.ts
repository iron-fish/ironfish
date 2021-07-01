/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BlockHeader, BlockHeaderSerde, SerializedBlockHeader } from '../primitives/blockheader'
import { Transaction } from '../primitives/transaction'
import Serde, { JsonSerializable } from '../serde'
import { IDatabaseEncoding, JsonEncoding } from '../storage'

export class BlockHeaderEncoding<
  E,
  H,
  T extends Transaction<E, H>,
  SE extends JsonSerializable,
  SH extends JsonSerializable,
  ST,
> implements IDatabaseEncoding<BlockHeader<E, H, T, SE, SH, ST>>
{
  jsonSerializer: JsonEncoding<SerializedBlockHeader<SH>>
  headerSerializer: BlockHeaderSerde<E, H, T, SE, SH, ST>

  constructor(serde: BlockHeaderSerde<E, H, T, SE, SH, ST>) {
    this.jsonSerializer = new JsonEncoding()
    this.headerSerializer = serde
  }

  serialize(value: BlockHeader<E, H, T, SE, SH, ST>): Buffer {
    const serialized = this.headerSerializer.serialize(value)
    const buffer = this.jsonSerializer.serialize(serialized)
    return buffer
  }

  deserialize(data: Buffer): BlockHeader<E, H, T, SE, SH, ST> {
    const json = this.jsonSerializer.deserialize(data)
    const deserialized = this.headerSerializer.deserialize(json)
    return deserialized
  }

  equals(): boolean {
    throw new Error('Do not use this')
  }
}

export class TransactionArrayEncoding<E, H, T extends Transaction<E, H>, ST>
  implements IDatabaseEncoding<T[]>
{
  jsonSerializer: JsonEncoding<ST[]>
  transactionSerializer: Serde<T, ST>

  constructor(serde: Serde<T, ST>) {
    this.jsonSerializer = new JsonEncoding()
    this.transactionSerializer = serde
  }

  serialize(value: T[]): Buffer {
    const serialized = value.map((t) => this.transactionSerializer.serialize(t))
    const buffer = this.jsonSerializer.serialize(serialized)
    return buffer
  }

  deserialize(data: Buffer): T[] {
    const json = this.jsonSerializer.deserialize(data)
    const deserialized = json.map((st) => this.transactionSerializer.deserialize(st))
    return deserialized
  }

  equals(): boolean {
    throw new Error('Do not use this')
  }
}
