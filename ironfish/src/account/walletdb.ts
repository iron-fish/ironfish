/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { FileSystem } from '../fileSystems'
import { IDatabase } from '../storage/database/database'
import { U32Encoding } from '../storage/database/encoding'
import { IDatabaseStore } from '../storage/database/store'
import { createDB } from '../storage/utils'
import { WorkerPool } from '../workerPool/pool'
import { WalletDBMetaValue, WalletDBMetaValueEncoding } from './database/walletmeta'

const DATABASE_VERSION = 1

const getWalletDBMetaDefaults = (): WalletDBMetaValue => ({
  defaultAccountId: 0,
})

export class WalletDB {
  database: IDatabase
  workerPool: WorkerPool
  location: string
  files: FileSystem

  meta: IDatabaseStore<{
    key: number
    value: WalletDBMetaValue
  }>

  constructor({
    files,
    location,
    workerPool,
  }: {
    files: FileSystem
    location: string
    workerPool: WorkerPool
  }) {
    this.files = files
    this.location = location
    this.workerPool = workerPool
    this.database = createDB({ location })

    this.meta = this.database.addStore<{
      key: number
      value: WalletDBMetaValue
    }>({
      name: 'meta',
      keyEncoding: new U32Encoding(),
      valueEncoding: new WalletDBMetaValueEncoding(),
    })
  }

  async open(options: { upgrade?: boolean } = { upgrade: true }): Promise<void> {
    await this.files.mkdir(this.location, { recursive: true })

    await this.database.open()

    if (options.upgrade) {
      await this.database.upgrade(DATABASE_VERSION)
    }
  }

  async close(): Promise<void> {
    await this.database.close()
  }

  async loadMeta(): Promise<WalletDBMetaValue> {
    const loadedMeta = await this.meta.get(0)

    return {
      ...getWalletDBMetaDefaults(),
      ...loadedMeta,
    }
  }
}
