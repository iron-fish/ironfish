/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Block } from '@ethereumjs/block'
import { EVM } from '@ethereumjs/evm'
import { Address } from '@ethereumjs/util'
import { RunTxOpts, RunTxResult, VM } from '@ethereumjs/vm'
import ContractArtifact from '@ironfish/ironfish-contracts'
import { ethers } from 'ethers'
import { Assert } from '../assert'
import { BlockchainDB } from '../blockchain/database/blockchaindb'
import { EvmBlockchain } from './blockchain'

export const INITIAL_STATE_ROOT = Buffer.from(
  // TODO(hughy): replace with state root after inserting global contract
  // keccak256 hash of RLP-encoded empty string
  '56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
  'hex',
)

export class IronfishEvm {
  private vm: VM | null
  private blockchainDb: BlockchainDB

  constructor(blockchainDb: BlockchainDB) {
    this.vm = null
    this.blockchainDb = blockchainDb
  }

  async open(): Promise<void> {
    const blockchain = new EvmBlockchain(this.blockchainDb)

    const evm = await EVM.create({ blockchain, stateManager: this.blockchainDb.stateManager })

    this.vm = await VM.create({ evm, stateManager: this.blockchainDb.stateManager })
  }

  async runTx(opts: RunTxOpts): Promise<RunTxResult> {
    Assert.isNotNull(this.vm, 'EVM not initialized')
    opts.block = Block.fromBlockData({ header: { baseFeePerGas: 0n } })
    return this.vm.runTx(opts)
  }

  async verifyTx(opts: RunTxOpts, vm?: VM): Promise<EvmResult> {
    Assert.isNotNull(this.vm, 'EVM not initialized')
    vm = vm ?? this.vm

    opts.block = Block.fromBlockData({ header: { baseFeePerGas: 0n } })
    const result = await vm.runTx(opts)

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
    }
  }

  async simulateTx(opts: RunTxOpts): Promise<RunTxResult> {
    return this.withCopy(async (vm) => {
      opts.block = Block.fromBlockData({ header: { baseFeePerGas: 0n } })
      return vm.runTx(opts)
    })
  }

  async withCopy<TResult>(handler: (copy: VM) => Promise<TResult>): Promise<TResult> {
    Assert.isNotNull(this.vm, 'EVM not initialized')
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

type UTXOEvent = EvmShield | EvmUnshield

export type EvmResult = {
  result: RunTxResult
  events: UTXOEvent[]
}
