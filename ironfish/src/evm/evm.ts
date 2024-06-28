/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { EVM } from '@ethereumjs/evm'
import { Address } from '@ethereumjs/util'
import { RunTxOpts, RunTxResult, VM } from '@ethereumjs/vm'
import { BlockchainDB } from '../blockchain/database/blockchaindb'
import { EvmBlockchain } from './blockchain'

export class IronfishEvm {
  private vm: VM
  // spending key
  static spendingKey = '3333fff66a72eff15588d48d9b5404e3a20a4ab90e0dfcf4aa999f1855788da6'
  static publicAddress = '2edbd0f3296a925ce373598294102c7179902bb5323b8bdcec54feabd10658d4'

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

  async verifyTx(opts: RunTxOpts): Promise<EvmResult> {
    // TODO(jwp) add db transaction and roll back
    const result = await this.runTx(opts)

    // TODO(jwp) from custom opcodes populate shields and unshields
    return {
      result,
      shields: [],
      unshields: [],
    }
  }
}

type EvmShield = {
  contract: Address
  assetId: Buffer
  amount: bigint
}

type EvmUnshield = {
  contract: Address
  assetId: Buffer
  amount: bigint
}

export type EvmResult = {
  result: RunTxResult
  shields: EvmShield[]
  unshields: EvmUnshield[]
}
