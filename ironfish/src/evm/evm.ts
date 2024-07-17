/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Block } from '@ethereumjs/block'
import { EVM } from '@ethereumjs/evm'
import { Address } from '@ethereumjs/util'
import { RunTxOpts, RunTxResult, VM } from '@ethereumjs/vm'
import { BlockchainDB } from '../blockchain/database/blockchaindb'
import { EvmBlockchain } from './blockchain'

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
    opts.block = Block.fromBlockData({ header: { baseFeePerGas: 0n } })
    return this.vm.runTx(opts)
  }

  async verifyTx(opts: RunTxOpts): Promise<EvmResult> {
    // TODO(jwp) add db transaction and roll back
    const result = await this.runTx(opts)

    // TODO(jwp) from custom opcodes populate shields and unshields
    return {
      result,
      events: [],
    }
  }

  async simulateTx(opts: RunTxOpts): Promise<RunTxResult> {
    return this.withCopy(async (vm) => {
      return vm.runTx(opts)
    })
  }

  private async withCopy<TResult>(handler: (copy: VM) => Promise<TResult>): Promise<TResult> {
    const vm = await this.vm.shallowCopy()

    await vm.evm.stateManager.checkpoint()

    try {
      return await handler(vm)
    } finally {
      await vm.evm.stateManager.revert()
    }
  }
}

type EvmShield = {
  name: 'shield'
  ironfishAddress: Buffer
  caller: Address
  assetId: Buffer
  amount: bigint
}

type EvmUnshield = {
  name: 'unshield'
  assetId: Buffer
  amount: bigint
}

type TransferOwnership = {
  name: 'transferOwnership'
  caller: Address
  assetId: Buffer
  newOwner: Address
}

type UTXOEvent = EvmShield | EvmUnshield | TransferOwnership

export type EvmResult = {
  result: RunTxResult
  events: UTXOEvent[]
}
