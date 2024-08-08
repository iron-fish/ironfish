/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Block } from '@ethereumjs/block'
import { EVM, Log } from '@ethereumjs/evm'
import { Account, Address, hexToBytes } from '@ethereumjs/util'
import { RunTxOpts, RunTxResult, VM } from '@ethereumjs/vm'
import ContractArtifact from '@ironfish/ironfish-contracts'
import { Asset, generateKeyFromPrivateKey } from '@ironfish/rust-nodejs'
import { ethers } from 'ethers'
import { Assert } from '../assert'
import { BlockchainDB } from '../blockchain/database/blockchaindb'
import { EvmDescription, evmDescriptionToLegacyTransaction } from '../primitives/evmDescription'
import { EvmBlockchain } from './blockchain'

export const INITIAL_STATE_ROOT = Buffer.from(
  'c7cd565517b3b4bf2fc0198bfcf12f4e0e9e4e1d1098388725212b07c61f951f',
  'hex',
)

const NULL_STATE_ROOT = Buffer.from(
  '56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
  'hex',
)

export const GLOBAL_IF_ACCOUNT = generateKeyFromPrivateKey(
  'a19c574ddaf90fb35e69f1b3f07adfbce0caf0db91ba29f7a7f5d4abe1e8c684',
)

export const GLOBAL_CONTRACT_ADDRESS = Address.fromString(
  '0xffffffffffffffffffffffffffffffffffffffff',
)

export class IronfishEvm {
  private vm: VM | null
  private blockchainDb: BlockchainDB

  constructor(blockchainDb: BlockchainDB) {
    this.vm = null
    this.blockchainDb = blockchainDb
  }

  async load(): Promise<void> {
    const stateRoot = await this.blockchainDb.stateManager.getStateRoot()

    if (Buffer.from(stateRoot).equals(NULL_STATE_ROOT)) {
      await this.blockchainDb.stateManager.checkpoint()
      const globalAccount = new Account(0n, 10000000000000000n)
      await this.blockchainDb.stateManager.putAccount(GLOBAL_CONTRACT_ADDRESS, globalAccount)
      await this.blockchainDb.stateManager.putContractCode(
        GLOBAL_CONTRACT_ADDRESS,
        hexToBytes(ContractArtifact.deployedBytecode),
      )
      await this.blockchainDb.stateManager.commit()
    }
  }

  async open(): Promise<void> {
    const blockchain = new EvmBlockchain(this.blockchainDb)

    const evm = await EVM.create({ blockchain, stateManager: this.blockchainDb.stateManager })

    this.vm = await VM.create({ evm, stateManager: this.blockchainDb.stateManager })
  }

  async runDesc(description: EvmDescription, vm?: VM): Promise<EvmResult> {
    const tx = evmDescriptionToLegacyTransaction(description)
    return this.runTx({ tx }, vm)
  }

  async runTx(opts: RunTxOpts, vm?: VM): Promise<EvmResult> {
    Assert.isNotNull(this.vm, 'EVM not initialized')
    vm = vm ?? this.vm

    opts.block = Block.fromBlockData({ header: { baseFeePerGas: 0n } })
    try {
      const result = await vm.runTx(opts)
      const events = this.decodeLogs(result.receipt.logs)
      return {
        result,
        events,
        error: undefined,
      }
    } catch (e) {
      if (e instanceof Error) {
        return {
          result: undefined,
          events: undefined,
          error: new EvmError(e.message),
        }
      }
      return {
        result: undefined,
        events: undefined,
        error: new EvmError('unknown evm execution error'),
      }
    }
  }

  async simulateTx(opts: RunTxOpts): Promise<EvmResult> {
    return this.withCopy(async (vm) => this.runTx(opts, vm))
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

  decodeLogs(logs: Log[]): UTXOEvent[] {
    const globalContract = new ethers.Interface(ContractArtifact.abi)

    const events: UTXOEvent[] = []

    for (const log of logs) {
      // todo: placeholder until we determine an address
      // if (Buffer.from(log[0]).toString('hex') !== 'globalContractAddress') {
      //   continue
      // }

      try {
        const [ironfishAddress, tokenId, caller, amount] = globalContract.decodeEventLog(
          'Shield',
          log[2],
        )

        events.push({
          name: 'shield',
          ironfishAddress: Buffer.from((ironfishAddress as string).slice(2), 'hex'),
          caller: Address.fromString(caller as string),
          assetId: this.getAssetId(caller as string, tokenId as bigint),
          amount: amount as bigint,
        })
      } catch (e) {
        try {
          const [caller, tokenId, amount] = globalContract.decodeEventLog('UnShield', log[2])

          events.push({
            name: 'unshield',
            assetId: this.getAssetId(caller as string, tokenId as bigint),
            amount: amount as bigint,
          })
        } catch (e) {
          continue
        }
      }
    }

    return events
  }

  private getAssetId(caller: string, tokenId: bigint): Buffer {
    if (caller.toLowerCase() === GLOBAL_CONTRACT_ADDRESS.toString().toLowerCase()) {
      return Asset.nativeId()
    }

    const name = `${caller.toLowerCase()}_${tokenId.toString()}`
    const asset = new Asset(GLOBAL_IF_ACCOUNT.publicAddress, name, '')

    return asset.id()
  }

  async getAccount(address: Address, stateRoot?: Uint8Array): Promise<Account | undefined> {
    const sm = await this.blockchainDb.stateManager.withStateRoot(stateRoot)
    return sm.getAccount(address)
  }

  async getBalance(address: Address, stateRoot?: Uint8Array): Promise<bigint | undefined> {
    const account = await this.getAccount(address, stateRoot)
    return account?.balance
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

export type UTXOEvent = EvmShield | EvmUnshield

export type EvmResult =
  | {
      result: RunTxResult
      error: undefined
      events: UTXOEvent[]
    }
  | {
      result: undefined
      error: EvmError
      events: undefined
    }

export class EvmError extends Error {
  name = this.constructor.name
}
