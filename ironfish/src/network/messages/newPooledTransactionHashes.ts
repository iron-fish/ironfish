/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { TransactionHash } from '../../primitives/transaction'
import { NetworkMessageType } from '../types'
import { NetworkMessage } from './networkMessage'

export class NewPooledTransactionHashes extends NetworkMessage {
  hashes: TransactionHash[]

  constructor(hashes: TransactionHash[]) {
    super(NetworkMessageType.NewPooledTransactionHashes)
    this.hashes = hashes
  }

  serializePayload(bw: bufio.StaticWriter | bufio.BufferWriter): void {
    bw.writeVarint(this.hashes.length)

    for (const hash of this.hashes) {
      bw.writeHash(hash)
    }
  }

  static deserializePayload(buffer: Buffer): NewPooledTransactionHashes {
    const reader = bufio.read(buffer, true)
    const length = reader.readVarint()
    const hashes = []

    for (let i = 0; i < length; i++) {
      const hash = reader.readHash()
      hashes.push(hash)
    }

    return new NewPooledTransactionHashes(hashes)
  }

  getSize(): number {
    let size = 0

    size += bufio.sizeVarint(this.hashes.length)

    size += this.hashes.length * 32

    return size
  }
}
