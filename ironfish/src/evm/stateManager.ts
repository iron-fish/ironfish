/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { DefaultStateManager, DefaultStateManagerOpts } from '@ethereumjs/statemanager'
import { Trie } from '@ethereumjs/trie'
import { ValueEncoding } from '@ethereumjs/util'
import { IDatabase } from '../storage'
import { EvmStateDB } from './database'

export type IronfishStateManagerOpts = Omit<DefaultStateManagerOpts, 'trie'>

export class IronfishStateManager extends DefaultStateManager {
  db: EvmStateDB

  constructor(db: IDatabase, opts?: IronfishStateManagerOpts) {
    super(opts)
    this.db = new EvmStateDB(db)
  }

  async open(): Promise<void> {
    this._trie = await Trie.create({
      db: this.db,
      useKeyHashing: true,
      valueEncoding: ValueEncoding.Bytes,
      useRootPersistence: true,
      common: this.common,
    })
  }

  async withStateRoot(stateRoot: Uint8Array | undefined): Promise<DefaultStateManager> {
    const stateManager = this.shallowCopy()
    if (stateRoot) {
      await stateManager.setStateRoot(stateRoot)
    }
    return stateManager
  }
}
