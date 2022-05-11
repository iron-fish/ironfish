/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import bufio from 'bufio'
import { IDatabaseEncoding } from '../../storage'

export interface MinedBlockValue {
  main: boolean
  sequence: number
  account: string
  minersFee: number
}

export class MinedBlockValueEncoding implements IDatabaseEncoding<MinedBlockValue> {
  serialize(value: MinedBlockValue): Buffer {
    const bw = bufio.write(this.getSize(value))
    if (value.main) {
      bw.writeU8(1)
    } else {
      bw.writeU8(0)
    }

    bw.writeU32(value.sequence)
    bw.writeVarString(value.account, 'utf8')
    bw.writeU32(value.minersFee)

    return bw.render()
  }

  deserialize(buffer: Buffer): MinedBlockValue {
    const reader = bufio.read(buffer, true)
    const main = Boolean(reader.readU8())
    const sequence = reader.readU32()
    const account = reader.readVarString('utf8')
    const minersFee = reader.readU32()

    return {
      main,
      sequence,
      account,
      minersFee,
    }
  }

  getSize(value: MinedBlockValue): number {
    let size = 1
    size += 4
    size += bufio.sizeVarString(value.account, 'utf8')
    size += 4
    return size
  }
}
