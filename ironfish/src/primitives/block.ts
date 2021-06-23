/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { zip } from 'lodash'
import Serde, { JsonSerializable } from '../serde'
import { Strategy } from '../strategy'
import { BlockHeader, BlockHeaderSerde, SerializedBlockHeader } from './blockheader'
import {
  IronfishNoteEncrypted,
  SerializedWasmNoteEncrypted,
  SerializedWasmNoteEncryptedHash,
  WasmNoteEncryptedHash,
} from './noteEncrypted'
import { Nullifier } from './nullifier'
import { IronfishTransaction, SerializedTransaction, Transaction } from './transaction'

/**
 * Represent a single block in the chain. Essentially just a block header
 * and the list of transactions that were added to the tree between the
 * previous block and the ones committed to in this header.
 */
export class Block<
  E,
  H,
  T extends Transaction<E, H>,
  SE extends JsonSerializable,
  SH extends JsonSerializable,
  ST
> {
  header: BlockHeader<E, H, T, SE, SH, ST>
  transactions: T[]

  constructor(header: BlockHeader<E, H, T, SE, SH, ST>, transactions: T[]) {
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
      transaction.withReference(() => {
        notes += transaction.notesLength()
        nullifiers += transaction.spendsLength()
      })
    }
    return { notes, nullifiers }
  }

  withTransactionReferences<R>(callback: () => R | Promise<R>): R | Promise<R> {
    for (const t of this.transactions) {
      t.takeReference()
    }

    try {
      return callback()
    } finally {
      for (const t of this.transactions) {
        t.returnReference()
      }
    }
  }

  /**
   * Get a list of all spends on transactions in this block.
   *
   * Note: there is no spend on a miner's fee transaction in the header
   */
  *spends(): Generator<{ nullifier: Nullifier; commitment: H; size: number }> {
    for (const transaction of this.transactions) {
      for (const spend of transaction.spends()) {
        yield spend
      }
    }
  }

  /**
   * Get a list of all notes created in this block including the miner's fee
   * note on the header.
   */
  *allNotes(): Generator<E> {
    for (const transaction of this.transactions) {
      for (const note of transaction.notes()) {
        yield note
      }
    }
  }
}

export type SerializedBlock<SH, ST> = {
  header: SerializedBlockHeader<SH>
  transactions: ST[]
}

export type SerializedCounts = { notes: number; nullifiers: number }

export class BlockSerde<
  E,
  H,
  T extends Transaction<E, H>,
  SE extends JsonSerializable,
  SH extends JsonSerializable,
  ST
> implements Serde<Block<E, H, T, SE, SH, ST>, SerializedBlock<SH, ST>> {
  blockHeaderSerde: BlockHeaderSerde<E, H, T, SE, SH, ST>

  constructor(readonly strategy: Strategy<E, H, T, SE, SH, ST>) {
    this.blockHeaderSerde = new BlockHeaderSerde(strategy)
  }

  equals(block1: Block<E, H, T, SE, SH, ST>, block2: Block<E, H, T, SE, SH, ST>): boolean {
    if (!this.blockHeaderSerde.equals(block1.header, block2.header)) {
      return false
    }
    if (block1.transactions.length !== block2.transactions.length) {
      return false
    }
    for (const [transaction1, transaction2] of zip(block1.transactions, block2.transactions)) {
      if (
        !transaction1 ||
        !transaction2 ||
        !this.strategy.transactionSerde().equals(transaction1, transaction2)
      ) {
        return false
      }
    }
    return true
  }
  serialize(block: Block<E, H, T, SE, SH, ST>): SerializedBlock<SH, ST> {
    return {
      header: this.blockHeaderSerde.serialize(block.header),
      transactions: block.transactions.map((t) =>
        this.strategy.transactionSerde().serialize(t),
      ),
    }
  }
  deserialize(data: SerializedBlock<SH, ST>): Block<E, H, T, SE, SH, ST> {
    if (
      typeof data === 'object' &&
      data !== null &&
      'header' in data &&
      'transactions' in data &&
      Array.isArray(data.transactions)
    ) {
      const header = this.blockHeaderSerde.deserialize(data.header)
      const transactions = data.transactions.map((t) =>
        this.strategy.transactionSerde().deserialize(t),
      )
      return new Block(header, transactions)
    }
    throw new Error('Unable to deserialize')
  }
}

export type IronfishBlock = Block<
  IronfishNoteEncrypted,
  WasmNoteEncryptedHash,
  IronfishTransaction,
  SerializedWasmNoteEncrypted,
  SerializedWasmNoteEncryptedHash,
  SerializedTransaction
>

export type IronfishBlockSerialized = SerializedBlock<
  SerializedWasmNoteEncryptedHash,
  SerializedTransaction
>
