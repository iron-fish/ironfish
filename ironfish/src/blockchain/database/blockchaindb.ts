/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { FileSystem } from '../../fileSystems'
import { BlockHeader } from '../../primitives'
import {
  BUFFER_ENCODING,
  IDatabase,
  IDatabaseStore,
  IDatabaseTransaction,
  StringEncoding,
} from '../../storage'
import { createDB } from '../../storage/utils'
import { HeadersSchema, MetaSchema, TransactionsSchema } from '../schema'
import { HeaderEncoding, HeaderValue } from './headers'
import { TransactionsValue, TransactionsValueEncoding } from './transactions'

export const VERSION_DATABASE_CHAIN = 14

export class BlockchainDB {
  db: IDatabase
  location: string
  files: FileSystem

  // BlockHash -> BlockHeader
  headers: IDatabaseStore<HeadersSchema>
  // Contains flat fields
  meta: IDatabaseStore<MetaSchema>
  // BlockHash -> BlockHeader
  transactions: IDatabaseStore<TransactionsSchema>

  constructor(options: { location: string; files: FileSystem }) {
    this.location = options.location
    this.files = options.files
    this.db = createDB({ location: options.location })

    // BlockHash -> BlockHeader
    this.headers = this.db.addStore({
      name: 'bh',
      keyEncoding: BUFFER_ENCODING,
      valueEncoding: new HeaderEncoding(),
    })

    // Flat Fields
    this.meta = this.db.addStore({
      name: 'bm',
      keyEncoding: new StringEncoding<'head' | 'latest'>(),
      valueEncoding: BUFFER_ENCODING,
    })

    // BlockHash -> Transaction[]
    this.transactions = this.db.addStore({
      name: 'bt',
      keyEncoding: BUFFER_ENCODING,
      valueEncoding: new TransactionsValueEncoding(),
    })
  }

  async open(): Promise<void> {
    await this.files.mkdir(this.location, { recursive: true })
    await this.db.open()
    await this.db.upgrade(VERSION_DATABASE_CHAIN)
  }

  async close(): Promise<void> {
    await this.db.close()
  }

  async getBlockHeader(
    blockHash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<BlockHeader | undefined> {
    return (await this.headers.get(blockHash, tx))?.header
  }

  async deleteHeader(hash: Buffer, tx?: IDatabaseTransaction): Promise<void> {
    return this.headers.del(hash, tx)
  }

  async putBlockHeader(
    hash: Buffer,
    header: HeaderValue,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    return this.headers.put(hash, header, tx)
  }

  async getMetaHash(
    key: 'head' | 'latest',
    tx?: IDatabaseTransaction,
  ): Promise<Buffer | undefined> {
    return this.meta.get(key, tx)
  }

  async putMetaHash(
    key: 'head' | 'latest',
    value: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    return this.meta.put(key, value, tx)
  }

  async getTransactions(
    blockHash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<TransactionsValue | undefined> {
    return this.transactions.get(blockHash, tx)
  }

  async addTransaction(
    hash: Buffer,
    value: TransactionsValue,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    return this.transactions.add(hash, value, tx)
  }

  async putTransaction(
    hash: Buffer,
    value: TransactionsValue,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    return this.transactions.put(hash, value, tx)
  }

  async deleteTransaction(hash: Buffer, tx?: IDatabaseTransaction): Promise<void> {
    return this.transactions.del(hash, tx)
  }
}
