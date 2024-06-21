/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { DefaultStateManager } from '@ethereumjs/statemanager'
import { Trie } from '@ethereumjs/trie'
import { ValueEncoding } from '@ethereumjs/util'
import { IDatabase } from '../storage'
import { EvmStateDB } from './database'

export class EvmState {
  db: IDatabase
  manager: DefaultStateManager | null = null

  constructor(db: IDatabase) {
    this.db = db
  }

  async init(): Promise<void> {
    const evmDB = new EvmStateDB(this.db)
    const trie = await Trie.create({
      db: evmDB,
      valueEncoding: ValueEncoding.Bytes,
      useRootPersistence: true,
    })
    this.manager = new DefaultStateManager({ trie })
  }
}
