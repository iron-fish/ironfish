/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert } from '../../assert'
import { Block } from '../../primitives'
import { Nullifier } from '../../primitives/nullifier'
import { TransactionHash } from '../../primitives/transaction'
import {
  BUFFER_ENCODING,
  DatabaseSchema,
  IDatabase,
  IDatabaseStore,
  IDatabaseTransaction,
  StringEncoding,
  U32_ENCODING,
} from '../../storage'

interface CounterEntry<T extends string> extends DatabaseSchema {
  key: T
  value: number
}

interface NullifiersSchema extends DatabaseSchema {
  key: Nullifier
  value: TransactionHash
}

export class NullifierSet {
  readonly db: IDatabase

  private readonly counter: IDatabaseStore<CounterEntry<'Size'>>

  private readonly nullifiers: IDatabaseStore<NullifiersSchema>

  constructor(options: { db: IDatabase; name: string }) {
    this.db = options.db

    this.counter = this.db.addStore({
      name: `${options.name}c`,
      keyEncoding: new StringEncoding<'Size'>(),
      valueEncoding: U32_ENCODING,
    })

    this.nullifiers = this.db.addStore({
      name: options.name,
      keyEncoding: BUFFER_ENCODING,
      valueEncoding: BUFFER_ENCODING,
    })
  }

  async size(tx?: IDatabaseTransaction): Promise<number> {
    const size = await this.counter.get('Size', tx)
    return size === undefined ? 0 : size
  }

  async contains(nullifier: Nullifier, tx?: IDatabaseTransaction): Promise<boolean> {
    return await this.nullifiers.has(nullifier, tx)
  }

  get(nullifier: Nullifier, tx?: IDatabaseTransaction): Promise<TransactionHash | undefined> {
    return this.nullifiers.get(nullifier, tx)
  }

  async connectBlock(block: Block, tx?: IDatabaseTransaction): Promise<void> {
    await this.db.withTransaction(tx, async (tx) => {
      let currentSize = await this.size(tx)

      for (const transaction of block.transactions) {
        for (const spend of transaction.spends) {
          // Throws an error if a nullifier already exists
          // We should never allow overwriting a nullifier
          await this.nullifiers.add(spend.nullifier, transaction.hash(), tx)

          currentSize++
        }
      }

      await this.counter.put('Size', currentSize, tx)
    })
  }

  async disconnectBlock(block: Block, tx?: IDatabaseTransaction): Promise<void> {
    await this.db.withTransaction(tx, async (tx) => {
      let currentSize = await this.size(tx)

      for (const transaction of block.transactions) {
        for (const spend of transaction.spends.slice().reverse()) {
          // Sanity check that we are removing the correct block
          // Not necessarily needed but will keep it here for confidence in the new nullifier set
          const current = await this.nullifiers.get(spend.nullifier, tx)
          Assert.isNotUndefined(current)
          Assert.isTrue(current.equals(transaction.hash()))

          await this.nullifiers.del(spend.nullifier, tx)

          currentSize--
        }
      }

      await this.counter.put('Size', currentSize, tx)
    })
  }

  async clear(tx?: IDatabaseTransaction): Promise<void> {
    await this.db.withTransaction(tx, async (tx) => {
      await this.nullifiers.clear(tx)
      await this.counter.clear(tx)
    })
  }
}
