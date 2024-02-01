/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { zip } from 'lodash'
import { Assert } from '../assert'
import { Blockchain } from '../blockchain'
import {
  BlockHeader,
  BlockHeaderSerde,
  RawBlockHeader,
  SerializedBlockHeader,
} from './blockheader'
import { MintDescription } from './mintDescription'
import { NoteEncrypted, NoteEncryptedHash } from './noteEncrypted'
import { Nullifier } from './nullifier'
import { SerializedTransaction, Transaction } from './transaction'

/**
 * The hash used in the "previousHash" field on the initial block in the
 * chain. The initial block is intentionally invalid, so we need to special
 * case it.
 */
export const GENESIS_BLOCK_PREVIOUS = Buffer.alloc(32)

export const GENESIS_BLOCK_SEQUENCE = 1

export const GRAFFITI_SIZE = 32

/**
 * Represent a single block in the chain. Essentially just a block header
 * and the list of transactions that were added to the tree between the
 * previous block and the ones committed to in this header.
 */
export class Block {
  header: BlockHeader
  transactions: Transaction[]

  constructor(header: BlockHeader, transactions: Transaction[]) {
    this.header = header
    this.transactions = transactions
  }

  /**
   * Get the number of notes and nullifiers stored on this block.
   */
  counts(): SerializedCounts {
    let notes = 0
    let nullifiers = 0

    for (const transaction of this.transactions) {
      notes += transaction.notes.length
      nullifiers += transaction.spends.length
    }

    return { notes, nullifiers }
  }

  /**
   * Get a list of all spends on transactions in this block.
   *
   * Note: there is no spend on a miner's fee transaction in the header
   */
  *spends(): Generator<{
    nullifier: Nullifier
    commitment: NoteEncryptedHash
    size: number
  }> {
    for (const transaction of this.transactions) {
      for (const spend of transaction.spends) {
        yield spend
      }
    }
  }

  /**
   * Get a list of all notes created in this block including the miner's fee
   * note on the header.
   */
  *notes(): Generator<NoteEncrypted> {
    for (const transaction of this.transactions) {
      for (const note of transaction.notes) {
        yield note
      }
    }
  }

  /**
   * Get a list of all mints on transactions in this block.
   */
  *mints(): Generator<MintDescription> {
    for (const transaction of this.transactions) {
      for (const mint of transaction.mints) {
        yield mint
      }
    }
  }

  equals(block: Block): boolean {
    if (block === this) {
      return true
    }

    if (!this.header.equals(block.header)) {
      return false
    }

    if (this.transactions.length !== block.transactions.length) {
      return false
    }

    for (const [transaction1, transaction2] of zip(this.transactions, block.transactions)) {
      if (!transaction1 || !transaction2 || !transaction1.equals(transaction2)) {
        return false
      }
    }

    return true
  }

  get minersFee(): Transaction {
    const tx = this.transactions[0]
    Assert.isNotUndefined(tx, 'Block has no miners fee')
    return tx
  }

  toCompactBlock(): CompactBlock {
    const header = this.header.toRaw()

    const [minersFee, ...transactions] = this.transactions
    const transactionHashes = transactions.map((t) => t.hash())

    return {
      header,
      transactionHashes,
      transactions: [
        {
          index: 0,
          transaction: minersFee,
        },
      ],
    }
  }
}

export type CompactBlockTransaction = {
  index: number
  transaction: Transaction
}

export type CompactBlock = {
  header: RawBlockHeader
  transactionHashes: Buffer[]
  transactions: CompactBlockTransaction[]
}

export type RawBlock = {
  header: RawBlockHeader
  transactions: Transaction[]
}

export type SerializedBlock = {
  header: SerializedBlockHeader
  transactions: SerializedTransaction[]
}

export type SerializedCounts = { notes: number; nullifiers: number }

export class BlockSerde {
  static serialize(block: Block): SerializedBlock {
    return {
      header: BlockHeaderSerde.serialize(block.header),
      transactions: block.transactions.map((t) => t.serialize()),
    }
  }

  static deserialize(data: SerializedBlock, chain: Blockchain): Block {
    if (
      typeof data === 'object' &&
      data !== null &&
      'header' in data &&
      'transactions' in data &&
      Array.isArray(data.transactions)
    ) {
      const header = BlockHeaderSerde.deserialize(data.header, chain)
      const transactions = data.transactions.map((t) => new Transaction(t))
      return new Block(header, transactions)
    }
    throw new Error('Unable to deserialize')
  }
}
