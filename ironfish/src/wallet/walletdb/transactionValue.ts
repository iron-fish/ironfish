/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { IDatabaseEncoding } from '../../storage/database/types'
import bufio from 'bufio'
import { Transaction } from '../../primitives'

export interface TransactionValue {
  transaction: Transaction
  timestamp: Date
  // These fields are populated once the transaction is on the main chain
  blockHash: Buffer | null
  sequence: number | null
  // This is populated when we create a transaction to track when we should
  // rebroadcast. This can be null if we created it on another node, or the
  // transaction was created for us by another person.
  submittedSequence: number | null
}

export class TransactionValueEncoding implements IDatabaseEncoding<TransactionValue> {
  serialize(value: TransactionValue): Buffer {
    const { transaction, blockHash, sequence, submittedSequence, timestamp } = value

    const bw = bufio.write(this.getSize(value))
    bw.writeVarBytes(transaction.serialize())
    bw.writeU64(timestamp.valueOf())

    let flags = 0
    flags |= Number(!!blockHash) << 0
    flags |= Number(!!submittedSequence) << 1
    flags |= Number(!!sequence) << 2
    bw.writeU8(flags)

    if (blockHash) {
      bw.writeHash(blockHash)
    }
    if (submittedSequence) {
      bw.writeU32(submittedSequence)
    }
    if (sequence) {
      bw.writeU32(sequence)
    }

    return bw.render()
  }

  deserialize(buffer: Buffer): TransactionValue {
    const reader = bufio.read(buffer, true)
    const transaction = new Transaction(reader.readVarBytes())
    const timestamp = new Date(reader.readU64())

    const flags = reader.readU8()
    const hasBlockHash = flags & (1 << 0)
    const hasSubmittedSequence = flags & (1 << 1)
    const hasSequence = flags & (1 << 2)

    let blockHash = null
    if (hasBlockHash) {
      blockHash = reader.readHash()
    }

    let submittedSequence = null
    if (hasSubmittedSequence) {
      submittedSequence = reader.readU32()
    }

    let sequence = null
    if (hasSequence) {
      sequence = reader.readU32()
    }

    return { transaction, blockHash, submittedSequence, sequence, timestamp }
  }

  getSize(value: TransactionValue): number {
    let size = bufio.sizeVarBytes(value.transaction.serialize())
    size += 8
    size += 1
    if (value.blockHash) {
      size += 32
    }
    if (value.submittedSequence) {
      size += 4
    }
    if (value.sequence) {
      size += 4
    }
    return size
  }
}
