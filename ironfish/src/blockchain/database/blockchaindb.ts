/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { FileSystem } from '../../fileSystems'
import { BlockHeader } from '../../primitives'
import { BUFFER_ENCODING, IDatabase, IDatabaseStore, IDatabaseTransaction } from '../../storage'
import { createDB } from '../../storage/utils'
import { HeadersSchema } from '../schema'
import { HeaderEncoding, HeaderValue } from './headers'

export const VERSION_DATABASE_CHAIN = 14

export class BlockchainDB {
  db: IDatabase
  location: string
  files: FileSystem

  // BlockHash -> BlockHeader
  headers: IDatabaseStore<HeadersSchema>

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
}
