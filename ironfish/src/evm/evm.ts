/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { EVM } from '@ethereumjs/evm'
import { DefaultStateManager } from '@ethereumjs/statemanager'
import { Trie } from '@ethereumjs/trie'
import { ValueEncoding } from '@ethereumjs/util'
import { RunTxOpts, RunTxResult, VM } from '@ethereumjs/vm'
import { BlockchainDB } from '../blockchain/database/blockchaindb'
import { EVMBlockchain } from './blockchain'
import { EvmStateDB } from './database'

export class IronfishEvm {
  stateManager: DefaultStateManager
  vm: VM
  constructor(stateManager: DefaultStateManager, vm: VM) {
    this.stateManager = stateManager
    this.vm = vm
  }

  static async create(blockchainDb: BlockchainDB): Promise<IronfishEvm> {
    const blockchain = new EVMBlockchain(blockchainDb)
    const evmDB = new EvmStateDB(blockchainDb.db)

    const trie = await Trie.create({
      db: evmDB,
      valueEncoding: ValueEncoding.Bytes,
      useRootPersistence: true,
    })
    const stateManager = new DefaultStateManager({ trie })

    const evm = await EVM.create({ blockchain, stateManager })

    const vm = await VM.create({ evm, stateManager })

    return new IronfishEvm(stateManager, vm)
  }

  async runTx(opts: RunTxOpts): Promise<RunTxResult> {
    return this.vm.runTx(opts)
  }
}
