/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { IDatabaseEncoding } from '../../storage'

export interface BalanceValue {
  unconfirmed: bigint
  blockHash: Buffer | null
  sequence: number | null
}

export class BalanceValueEncoding implements IDatabaseEncoding<BalanceValue> {
  serialize(value: BalanceValue): Buffer {
    const bw = bufio.write(this.getSize(value))
    bw.writeBigU64(value.unconfirmed)

    let flags = 0
    flags |= Number(!!value.blockHash) << 0
    flags |= Number(!!value.sequence) << 1
    bw.writeU8(flags)

    if (value.blockHash) {
      bw.writeHash(value.blockHash)
    }

    if (value.sequence) {
      bw.writeU32(value.sequence)
    }

    return bw.render()
  }

  deserialize(buffer: Buffer): BalanceValue {
    const reader = bufio.read(buffer, true)
    const value = reader.readBigU64()

    const flags = reader.readU8()
    const hasBlockHash = flags & (1 << 0)
    const hasSequence = flags & (1 << 1)

    let blockHash = null
    if (hasBlockHash) {
      blockHash = reader.readHash()
    }

    let sequence = null
    if (hasSequence) {
      sequence = reader.readU32()
    }

    return {
      unconfirmed: value,
      blockHash,
      sequence,
    }
  }

  getSize(value: BalanceValue): number {
    let size = 0
    size += 8 // value
    size += 1 // flags

    if (value.blockHash) {
      size += 32
    }

    if (value.sequence) {
      size += 4
    }

    return size
  }
}
