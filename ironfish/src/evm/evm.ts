/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { EVM } from '@ethereumjs/evm'
import { DefaultStateManager } from '@ethereumjs/statemanager'
import { Trie } from '@ethereumjs/trie'
import { ValueEncoding } from '@ethereumjs/util'
import { BlockchainDB } from '../blockchain/database/blockchaindb'
import { EvmBlockchain } from './blockchain'
import { EvmStateDB } from './database'

export class IronfishEvm {
  evm: EVM

  constructor(evm: EVM) {
    this.evm = evm
  }

  static async create(blockchainDb: BlockchainDB): Promise<IronfishEvm> {
    const blockchain = new EvmBlockchain(blockchainDb)
    const evmDB = new EvmStateDB(blockchainDb.db)
    const trie = await Trie.create({
      db: evmDB,
      valueEncoding: ValueEncoding.Bytes,
      useRootPersistence: true,
    })
    const stateManager = new DefaultStateManager({ trie })

    const evm = await EVM.create({ blockchain, stateManager })

    return new IronfishEvm(evm)
  }
}
