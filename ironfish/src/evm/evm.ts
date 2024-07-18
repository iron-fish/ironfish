/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Block } from '@ethereumjs/block'
import { EVM } from '@ethereumjs/evm'
import { Address } from '@ethereumjs/util'
import { RunTxOpts, RunTxResult, VM } from '@ethereumjs/vm'
import { ethers } from 'ethers'
import { BlockchainDB } from '../blockchain/database/blockchaindb'
import { EvmBlockchain } from './blockchain'
import { ContractArtifact } from './globalContract'

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
    opts.block = Block.fromBlockData({ header: { baseFeePerGas: 0n } })
    return this.vm.runTx(opts)
  }

  async verifyTx(opts: RunTxOpts): Promise<EvmResult> {
    // TODO(jwp) add db transaction and roll back
    const result = await this.runTx(opts)

    // TODO(jwp) from custom opcodes populate shields and unshields

    const shields: EvmShield[] = []

    for (const log of result.receipt.logs) {
      // todo: placeholder until we determine an address
      // if (Buffer.from(log[0]).toString('hex') !== 'globalContractAddress') {
      //   continue
      // }

      try {
        const globalContract = new ethers.Interface(ContractArtifact.abi)
        const [ironfishAddress, assetId, caller, amount] = globalContract.decodeEventLog(
          'Shield',
          log[2],
        )
        shields.push({
          name: 'shield',
          ironfishAddress: Buffer.from((ironfishAddress as string).slice(2), 'hex'),
          caller: Address.fromString(caller as string),
          assetId: Buffer.from((assetId as string).slice(2), 'hex'),
          amount: amount as bigint,
        })
      } catch (e) {
        continue
      }
    }

    return {
      result,
      events: [...shields],
      // shields,
      // unshields: [],
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

export type EvmShield = {
  name: 'shield'
  ironfishAddress: Buffer
  assetId: Buffer
  caller: Address
  amount: bigint
}

export type EvmUnshield = {
  name: 'unshield'
  assetId: Buffer
  amount: bigint
}

export type TransferOwnership = {
  name: 'transferOwnership'
  caller: Address
  assetId: Buffer
  newOwner: Address
}

export type UTXOEvent = EvmShield | EvmUnshield | TransferOwnership

export type EvmResult = {
  result: RunTxResult
  events: UTXOEvent[]
}
