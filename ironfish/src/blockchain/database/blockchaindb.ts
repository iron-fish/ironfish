/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../assert'
import { FileSystem } from '../../fileSystems'
import { BlockHeader } from '../../primitives'
import { BlockHash } from '../../primitives/blockheader'
import {
  BUFFER_ENCODING,
  IDatabase,
  IDatabaseStore,
  IDatabaseTransaction,
  StringEncoding,
  U32_ENCODING,
} from '../../storage'
import { createDB } from '../../storage/utils'
import {
  HeadersSchema,
  MetaSchema,
  SequenceToHashesSchema,
  TransactionsSchema,
} from '../schema'
import { HeaderEncoding, HeaderValue } from './headers'
import { SequenceToHashesValueEncoding } from './sequenceToHashes'
import { TransactionsValue, TransactionsValueEncoding } from './transactions'

export const VERSION_DATABASE_CHAIN = 28

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
  // Sequence -> BlockHash[]
  sequenceToHashes: IDatabaseStore<SequenceToHashesSchema>

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

    // number -> BlockHash[]
    this.sequenceToHashes = this.db.addStore({
      name: 'bs',
      keyEncoding: U32_ENCODING,
      valueEncoding: new SequenceToHashesValueEncoding(),
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

  async getBlockHashesAtSequence(
    sequence: number,
    tx?: IDatabaseTransaction,
  ): Promise<BlockHash[]> {
    const hashes = await this.sequenceToHashes.get(sequence, tx)
    if (!hashes) {
      return []
    }

    return hashes.hashes
  }

  async getBlockHeadersAtSequence(
    sequence: number,
    tx?: IDatabaseTransaction,
  ): Promise<BlockHeader[]> {
    const hashes = await this.sequenceToHashes.get(sequence, tx)

    if (!hashes) {
      return []
    }

    const headers = await Promise.all(
      hashes.hashes.map(async (h) => {
        const header = await this.getBlockHeader(h, tx)
        Assert.isNotUndefined(header)
        return header
      }),
    )

    return headers
  }

  async deleteSequenceToHashes(sequence: number, tx?: IDatabaseTransaction): Promise<void> {
    return this.sequenceToHashes.del(sequence, tx)
  }

  async putSequenceToHashes(
    sequence: number,
    hashes: Buffer[],
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    return this.sequenceToHashes.put(sequence, { hashes }, tx)
  }
}
