/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Account, Address, hexToBytes } from '@ethereumjs/util'
import { generateKey } from '@ironfish/rust-nodejs'
import { EvmTransaction, IronfishEvm } from '@ironfish/sdk'
import { ethers } from 'ethers'
import { IronfishCommand } from '../command'
import { LocalFlags } from '../flags'

export class TestEvmCommand extends IronfishCommand {
  static description = `Test adding EVM support to the Iron Fish network`
  static flags = { ...LocalFlags }

  async start(): Promise<void> {
    const node = await this.sdk.node()
    await node.openDB()
    const blockchainDb = node.chain.blockchainDb

    const evm = await IronfishEvm.create(blockchainDb)

    // await this.accountSetup(evm)
    // await this.sendTransaction(evm)
    await this.deployContract(evm)
    await node.closeDB()
  }

  private async deployContract(evm: IronfishEvm) {
    const senderKey = generateKey()
    const senderPrivateKey = Uint8Array.from(Buffer.from(senderKey.spendingKey, 'hex'))
    const senderAddress = Address.fromPrivateKey(senderPrivateKey)
    const senderAccount = new Account(BigInt(0), 50_000_000n)

    await evm.stateManager.checkpoint()
    await evm.stateManager.putAccount(senderAddress, senderAccount)
    await evm.stateManager.commit()

    const tx = new EvmTransaction({
      gasLimit: 1_000_000n,
      gasPrice: 7n,
      data: '0x6080604052348015600e575f80fd5b506102fd8061001c5f395ff3fe608060405234801561000f575f80fd5b5060043610610034575f3560e01c8063431980d91461003857806346305f9e14610054575b5f80fd5b610052600480360381019061004d91906101a3565b61005e565b005b61005c610098565b005b7f01dd0bd9dcc08112377c73e9287b9868747423b310ae53399bcdafa157b9a19a8160405161008d91906101e7565b60405180910390a150565b3073ffffffffffffffffffffffffffffffffffffffff1663431980d960405180606001604052807f4368696e6573650000000000000000000000000000000000000000000000000081526020017f4368696e6573650000000000000000000000000000000000000000000000000081526020017f4368696e657365000000000000000000000000000000000000000000000000008152506040518263ffffffff1660e01b815260040161014b91906102ae565b5f604051808303815f87803b158015610162575f80fd5b505af1158015610174573d5f803e3d5ffd5b50505050565b5f80fd5b5f80fd5b5f8190508260206003028201111561019d5761019c61017e565b5b92915050565b5f606082840312156101b8576101b761017a565b5b5f6101c584828501610182565b91505092915050565b82818337505050565b6101e3606083836101ce565b5050565b5f6060820190506101fa5f8301846101d7565b92915050565b5f60039050919050565b5f81905092915050565b5f819050919050565b5f819050919050565b61022f8161021d565b82525050565b5f6102408383610226565b60208301905092915050565b5f602082019050919050565b61026181610200565b61026b818461020a565b925061027682610214565b805f5b838110156102a657815161028d8782610235565b96506102988361024c565b925050600181019050610279565b505050505050565b5f6060820190506102c15f830184610258565b9291505056fea26469706673582212207b89fc308ee835e4b2cbb77a6d5d4d0df52368cb917c496eec8b2bc293dac5c164736f6c634300081a0033',
    })

    const result = await evm.runTx({ tx: tx.sign(senderPrivateKey) })

    const globalContractAddress = result.createdAddress

    if (!globalContractAddress) {
      this.error('Contract creation of address failed')
    }

    const contract = await evm.stateManager.getAccount(globalContractAddress)

    if (!contract) {
      this.error('Contract creation failed')
    }

    this.log(`Contract created at: ${globalContractAddress.toString()}`)

    const utxoI = new ethers.Interface([
      {
        anonymous: false,
        inputs: [
          {
            indexed: false,
            internalType: 'bytes32[3]',
            name: 'note',
            type: 'bytes32[3]',
          },
        ],
        name: 'EncryptedNote',
        type: 'event',
      },
      {
        inputs: [
          {
            internalType: 'bytes32[3]',
            name: 'note',
            type: 'bytes32[3]',
          },
        ],
        name: 'shield',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
      {
        inputs: [],
        name: 'shield_test',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
    ])
    const data2 = utxoI.encodeFunctionData('shield_test', [])

    const tx2 = new EvmTransaction({
      nonce: 1n,
      gasLimit: 100_000n,
      to: globalContractAddress,
      gasPrice: 7n,
      data: data2,
    })

    const result2 = await evm.runTx({ tx: tx2.sign(senderPrivateKey) })
    for (const log of result2.receipt.logs) {
      this.log(`Log Output: ${Buffer.from(log[2]).toString('ascii')}`)
    }
  }

  async sendTransaction(evm: IronfishEvm) {
    const senderKey = generateKey()
    const receipientKey = generateKey()

    const senderPrivateKey = Uint8Array.from(Buffer.from(senderKey.spendingKey, 'hex'))
    const senderAddress = Address.fromPrivateKey(senderPrivateKey)

    const recipientPrivateKey = Uint8Array.from(Buffer.from(receipientKey.spendingKey, 'hex'))
    const recipientAddress = Address.fromPrivateKey(recipientPrivateKey)

    const senderAccount = new Account(BigInt(0), 500000n)

    await evm.stateManager.checkpoint()
    await evm.stateManager.putAccount(senderAddress, senderAccount)
    await evm.stateManager.commit()

    let senderBalance = (await evm.stateManager.getAccount(senderAddress))?.balance ?? 0n
    this.log(
      `Sender account at address ${senderAddress.toString()} has balance ${senderBalance}`,
    )

    const tx = new EvmTransaction({
      to: recipientAddress,
      value: 200000n,
      gasLimit: 21000n,
      gasPrice: 7n,
    })

    this.log(
      `Sending ${tx.value} from ${senderAddress.toString()} to ${recipientAddress.toString()}`,
    )

    const result = await evm.runTx({ tx: tx.sign(senderPrivateKey) })
    this.log(`Amount spent for gas: ${result.amountSpent}`)

    senderBalance = (await evm.stateManager.getAccount(senderAddress))?.balance ?? 0n
    this.log(`Sender at address ${recipientAddress.toString()} has balance ${senderBalance}`)

    const recipientBalance =
      (await evm.stateManager.getAccount(recipientAddress))?.balance ?? 0n
    this.log(
      `Recipient at address ${recipientAddress.toString()} has balance ${recipientBalance}`,
    )
  }

  async accountSetup(evm: IronfishEvm) {
    const stateManager = evm.stateManager

    const address = new Address(hexToBytes('0xa94f5374fce5edbc8e2a8697c15331677e6ebf0b'))
    const account = new Account(BigInt(0), BigInt(1000))
    await stateManager.checkpoint()
    await stateManager.putAccount(address, account)
    await stateManager.commit()
    await stateManager.flush()

    const balance = (await stateManager.getAccount(address))?.balance ?? 0n
    this.log(`Account at address ${address.toString()} has balance ${balance}`)
  }
}
