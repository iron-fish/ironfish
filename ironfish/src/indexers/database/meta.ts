/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { IDatabaseEncoding } from '../../storage'

export type MinedBlocksDBMeta = {
  headHash: string | null
}

export type MetaValue = MinedBlocksDBMeta[keyof MinedBlocksDBMeta]

export class MetaValueEncoding implements IDatabaseEncoding<MetaValue> {
  serialize(value: MetaValue): Buffer {
    const bw = bufio.write(this.getSize(value))
    if (value) {
      bw.writeHash(value)
    }
    return bw.render()
  }

  deserialize(buffer: Buffer): MetaValue {
    const reader = bufio.read(buffer, true)
    if (reader.left()) {
      return reader.readHash('hex')
    }

    return null
  }

  getSize(value: MetaValue): number {
    if (!value) {
      return 0
    }

    return 32
  }
}
