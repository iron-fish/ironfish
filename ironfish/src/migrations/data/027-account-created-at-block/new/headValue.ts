/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { IDatabaseEncoding } from '../../../../storage'

export type HeadValue = {
  hash: Buffer
  sequence: number
}

export class NullableHeadValueEncoding implements IDatabaseEncoding<HeadValue | null> {
  readonly nonNullSize = 32 + 4 // 256-bit block hash + 32-bit integer

  serialize(value: HeadValue | null): Buffer {
    const bw = bufio.write(this.getSize(value))

    if (value) {
      bw.writeHash(value.hash)
      bw.writeU32(value.sequence)
    }

    return bw.render()
  }

  deserialize(buffer: Buffer): HeadValue | null {
    const reader = bufio.read(buffer, true)

    if (reader.left()) {
      const hash = reader.readHash()
      const sequence = reader.readU32()
      return { hash, sequence }
    }

    return null
  }

  getSize(value: HeadValue | null): number {
    return value ? this.nonNullSize : 0
  }
}
