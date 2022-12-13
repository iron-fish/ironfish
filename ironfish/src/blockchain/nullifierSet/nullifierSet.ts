/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert } from '../../assert'
import { Block, Transaction } from '../../primitives'
import { Nullifier } from '../../primitives/nullifier'
import {
  BUFFER_ENCODING,
  DatabaseSchema,
  IDatabase,
  IDatabaseStore,
  IDatabaseTransaction,
  StringEncoding,
  U32_ENCODING,
} from '../../storage'
import { NullifierInfo, NullifierLocationEncoding } from './encoding'

interface CounterEntry<T extends string> extends DatabaseSchema {
  key: T
  value: number
}

interface NullifiersSchema extends DatabaseSchema {
  key: Nullifier
  value: NullifierInfo
}

export class NullifierSet {
  readonly db: IDatabase

  // Keep track of number of nullifiers in the set
  private readonly counter: IDatabaseStore<CounterEntry<'Size'>>

  // Nullifier -> TransactionHash, position
  private readonly nullifiers: IDatabaseStore<NullifiersSchema>

  constructor(options: { db: IDatabase; storeName: string }) {
    this.db = options.db

    this.counter = this.db.addStore({
      name: `${options.storeName}c`,
      keyEncoding: new StringEncoding<'Size'>(),
      valueEncoding: U32_ENCODING,
    })

    this.nullifiers = this.db.addStore({
      name: options.storeName,
      keyEncoding: BUFFER_ENCODING,
      valueEncoding: new NullifierLocationEncoding(),
    })
  }

  size(tx?: IDatabaseTransaction): Promise<number> {
    return this.db.withTransaction(tx, async (tx) => {
      const size = await this.counter.get('Size', tx)
      return size === undefined ? 0 : size
    })
  }

  contains(nullifier: Nullifier, tx?: IDatabaseTransaction): Promise<boolean> {
    return this.db.withTransaction(tx, async (tx) => {
      return await this.nullifiers.has(nullifier, tx)
    })
  }

  contained(nullifier: Nullifier, size: number, tx?: IDatabaseTransaction): Promise<boolean> {
    return this.db.withTransaction(tx, async (tx) => {
      const nullifierInfo = await this.nullifiers.get(nullifier, tx)
      if (nullifierInfo === undefined) {
        return false
      }

      return nullifierInfo.position < size
    })
  }

  get(nullifier: Nullifier, tx?: IDatabaseTransaction): Promise<NullifierInfo | undefined> {
    return this.db.withTransaction(tx, async (tx) => {
      return await this.nullifiers.get(nullifier, tx)
    })
  }

  connectBlock(block: Block, tx?: IDatabaseTransaction): Promise<void> {
    return this.db.withTransaction(tx, async (tx) => {
      let currentSize = await this.size(tx)

      for (const transaction of block.transactions) {
        for (const spend of transaction.spends()) {
          // Throws an error if a nullifier already exists
          // We should never allow overwriting a nullifier
          await this.nullifiers.add(
            spend.nullifier,
            {
              transactionHash: transaction.hash(),
              position: currentSize,
            },
            tx,
          )

          currentSize++
        }
      }

      await this.counter.put('Size', currentSize, tx)
    })
  }

  disconnectBlock(block: Block, tx?: IDatabaseTransaction): Promise<void> {
    return this.db.withTransaction(tx, async (tx) => {
      let currentSize = await this.size(tx)

      for (const transaction of block.transactions) {
        for (const spend of [...transaction.spends()].reverse()) {
          // Sanity check that we are removing the correct block
          // Not necessarily needed but will keep it here for confidence in the new nullifier set
          const current = await this.nullifiers.get(spend.nullifier, tx)
          Assert.isNotUndefined(current)
          Assert.isTrue(current.transactionHash.equals(transaction.hash()))
          Assert.isEqual(current.position, currentSize - 1)

          await this.nullifiers.del(spend.nullifier, tx)

          currentSize--
        }
      }

      await this.counter.put('Size', currentSize, tx)
    })
  }
}
