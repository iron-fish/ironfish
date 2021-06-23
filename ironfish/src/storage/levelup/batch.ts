/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { LevelupDatabase } from './database'
import { AbstractBatch, DelBatch, PutBatch } from 'abstract-leveldown'
import {
  DatabaseSchema,
  IDatabaseBatch,
  IDatabaseStore,
  SchemaKey,
  SchemaValue,
} from '../database'

export class LevelupBatch implements IDatabaseBatch {
  db: LevelupDatabase
  queue: AbstractBatch[] = []

  constructor(db: LevelupDatabase) {
    this.db = db
  }

  putEncoded(key: Buffer, value: Buffer): LevelupBatch {
    this.queue.push({ type: 'put', key: key, value: value } as PutBatch)
    return this
  }

  delEncoded(key: Buffer): LevelupBatch {
    this.queue.push({ type: 'del', key: key } as DelBatch)
    return this
  }

  put<Schema extends DatabaseSchema>(
    store: IDatabaseStore<Schema>,
    key: SchemaKey<Schema>,
    value: SchemaValue<Schema>,
  ): LevelupBatch {
    const [encodedKey, encodedValue] = store.encode(key, value)
    return this.putEncoded(encodedKey, encodedValue)
  }

  del<Schema extends DatabaseSchema>(
    store: IDatabaseStore<Schema>,
    key: SchemaKey<Schema>,
  ): LevelupBatch {
    const [encodedKey] = store.encode(key)
    return this.delEncoded(encodedKey)
  }

  async commit(): Promise<void> {
    if (this.queue.length === 0) {
      return
    }
    await this.db.levelup.batch(this.queue)
    this.queue.length = 0
  }
}
