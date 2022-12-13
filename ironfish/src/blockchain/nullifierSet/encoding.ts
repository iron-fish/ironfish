/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { IDatabaseEncoding } from '../../storage/database/types'
import bufio from 'bufio'
import { TransactionHash } from '../../primitives/transaction'

export type NullifierInfo = {
  // transaction the nullfier is a part of on the main chain
  transactionHash: TransactionHash
  // zero indexed position of the nullfiier on the main chain
  // Use 32 bit because we use 32 bit for nullifier tree. This is
  // somewhat small but if we end up having to increase nullifier tree size
  // we can increase this size at the same time
  position: number
}

export class NullifierLocationEncoding implements IDatabaseEncoding<NullifierInfo> {
  serialize(value: NullifierInfo): Buffer {
    const bw = bufio.write(this.getSize())

    bw.writeHash(value.transactionHash)
    bw.writeU32(value.position)

    return bw.render()
  }

  deserialize(buffer: Buffer): NullifierInfo {
    const reader = bufio.read(buffer, true)

    const transactionHash = reader.readHash()
    const position = reader.readU32()

    return { transactionHash, position }
  }

  getSize(): number {
    let size = 0
    size += 32 // transaction hash
    size += 4 // nullifier position
    return size
  }
}
