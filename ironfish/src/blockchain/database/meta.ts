/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { IDatabaseEncoding } from '../../storage/database/types'
import bufio from 'bufio'

export type MetaValue = {
  hash: Buffer
}

export class MetaValueEncoding implements IDatabaseEncoding<MetaValue> {
  serialize(value: MetaValue): Buffer {
    const bw = bufio.write(this.getSize())
    bw.writeHash(value.hash)
    return bw.render()
  }

  deserialize(data: Buffer): MetaValue {
    const reader = bufio.read(data, true)
    const hash = reader.readHash()
    return { hash }
  }

  getSize(): number {
    let size = 0
    size += 32
    return size
  }
}
