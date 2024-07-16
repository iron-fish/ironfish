/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { EVM } from '@ethereumjs/evm'
import { RunTxOpts, RunTxResult, VM } from '@ethereumjs/vm'
import { BlockchainDB } from '../blockchain/database/blockchaindb'
import { EvmBlockchain } from './blockchain'

export const INITIAL_STATE_ROOT = Buffer.from(
  // TODO(hughy): replace with state root after inserting global contract
  // keccak256 hash of RLP-encoded empty string
  '56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
  'hex',
)

export class IronfishEvm {
  private vm: VM

  constructor(vm: VM) {
    this.vm = vm
  }

  static async create(blockchainDb: BlockchainDB): Promise<IronfishEvm> {
    const blockchain = new EvmBlockchain(blockchainDb)

    const evm = await EVM.create({ blockchain, stateManager: blockchainDb.stateManager })

    const vm = await VM.create({ evm, stateManager: blockchainDb.stateManager })

    return new IronfishEvm(vm)
  }

  async runTx(opts: RunTxOpts): Promise<RunTxResult> {
    return this.vm.runTx(opts)
  }
}
