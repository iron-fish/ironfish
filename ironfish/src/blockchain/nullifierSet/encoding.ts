/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { IDatabaseEncoding } from '../../storage/database/types'
import bufio from 'bufio'
import { TransactionHash } from '../../primitives/transaction'

export type NullifierInfo = {
  transactionHash: TransactionHash // transaction the nullfier is a part of on the main chain
  position: number // zero indexed position of the nullfiier on the main chain
}

export class NullifierLocationEncoding implements IDatabaseEncoding<NullifierInfo> {
  serialize(value: NullifierInfo): Buffer {
    const bw = bufio.write(this.getSize())

    bw.writeHash(value.transactionHash)
    bw.writeU64(value.position)

    return bw.render()
  }

  deserialize(buffer: Buffer): NullifierInfo {
    const reader = bufio.read(buffer, true)

    const transactionHash = reader.readHash()
    const position = reader.readU64()

    return { transactionHash, position }
  }

  getSize(): number {
    let size = 0
    size += 32 // transaction hash
    size += 8 // nullifier position
    return size
  }
}
