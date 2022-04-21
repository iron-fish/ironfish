/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BlockHeader, BlockHeaderSerde, SerializedBlockHeader } from '../primitives/blockheader'
import { IDatabaseEncoding, JsonEncoding } from '../storage'

export class BlockHeaderEncoding implements IDatabaseEncoding<BlockHeader> {
  jsonSerializer: JsonEncoding<SerializedBlockHeader>
  headerSerializer: BlockHeaderSerde

  constructor(serde: BlockHeaderSerde) {
    this.jsonSerializer = new JsonEncoding()
    this.headerSerializer = serde
  }

  serialize(value: BlockHeader): Buffer {
    const serialized = this.headerSerializer.serialize(value)
    const buffer = this.jsonSerializer.serialize(serialized)
    return buffer
  }

  deserialize(data: Buffer): BlockHeader {
    const json = this.jsonSerializer.deserialize(data)
    const deserialized = this.headerSerializer.deserialize(json)
    return deserialized
  }

  equals(): boolean {
    throw new Error('Do not use this')
  }
}
