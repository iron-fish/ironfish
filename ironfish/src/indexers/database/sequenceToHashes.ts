/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import bufio from 'bufio'
import { IDatabaseEncoding } from '../../storage'

export interface SequenceToHashesValue {
  hashes: Buffer[]
}

export class SequenceToHashesValueEncoding implements IDatabaseEncoding<SequenceToHashesValue> {
  serialize(value: SequenceToHashesValue): Buffer {
    const bw = bufio.write(this.getSize(value))

    for (const hash of value.hashes) {
      bw.writeHash(hash)
    }

    return bw.render()
  }

  deserialize(buffer: Buffer): SequenceToHashesValue {
    const reader = bufio.read(buffer, true)

    const hashes = []

    while (reader.left()) {
      hashes.push(reader.readHash())
    }

    return { hashes }
  }

  getSize(value: SequenceToHashesValue): number {
    return 32 * value.hashes.length
  }
}
