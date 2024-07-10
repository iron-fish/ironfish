/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { LegacyTransaction } from '@ethereumjs/tx'
import { Account, Address } from '@ethereumjs/util'
import { generateKey } from '@ironfish/rust-nodejs'
import { IronfishEvm } from '@ironfish/sdk'
import { ethers } from 'ethers'
import Web3 from 'web3'
import { IronfishCommand } from '../command'
import { LocalFlags } from '../flags'
import { ABI } from './abi'

export class TestEvmCommand extends IronfishCommand {
  static description = `Test adding EVM support to the Iron Fish network`

  static flags = { ...LocalFlags }

  async start(): Promise<void> {
    const node = await this.sdk.node()
    await node.openDB()

    const evm = await IronfishEvm.create(node.chain.blockchainDb)

    const senderKey = generateKey()
    const receipientKey = generateKey()

    const senderPrivateKey = Uint8Array.from(Buffer.from(senderKey.spendingKey, 'hex'))
    const recipientPrivateKey = Uint8Array.from(Buffer.from(receipientKey.spendingKey, 'hex'))

    const senderAddress = Address.fromPrivateKey(senderPrivateKey)
    const recipientAddress = Address.fromPrivateKey(recipientPrivateKey)

    const senderAccount = new Account(BigInt(0), 500000n)

    const data =
      '0x6080604052348015600e575f80fd5b506102fd8061001c5f395ff3fe608060405234801561000f575f80fd5b5060043610610034575f3560e01c8063431980d91461003857806346305f9e14610054575b5f80fd5b610052600480360381019061004d91906101a3565b61005e565b005b61005c610098565b005b7f01dd0bd9dcc08112377c73e9287b9868747423b310ae53399bcdafa157b9a19a8160405161008d91906101e7565b60405180910390a150565b3073ffffffffffffffffffffffffffffffffffffffff1663431980d960405180606001604052807f4368696e6573650000000000000000000000000000000000000000000000000081526020017f4368696e6573650000000000000000000000000000000000000000000000000081526020017f4368696e657365000000000000000000000000000000000000000000000000008152506040518263ffffffff1660e01b815260040161014b91906102ae565b5f604051808303815f87803b158015610162575f80fd5b505af1158015610174573d5f803e3d5ffd5b50505050565b5f80fd5b5f80fd5b5f8190508260206003028201111561019d5761019c61017e565b5b92915050565b5f606082840312156101b8576101b761017a565b5b5f6101c584828501610182565b91505092915050565b82818337505050565b6101e3606083836101ce565b5050565b5f6060820190506101fa5f8301846101d7565b92915050565b5f60039050919050565b5f81905092915050565b5f819050919050565b5f819050919050565b61022f8161021d565b82525050565b5f6102408383610226565b60208301905092915050565b5f602082019050919050565b61026181610200565b61026b818461020a565b925061027682610214565b805f5b838110156102a657815161028d8782610235565b96506102988361024c565b925050600181019050610279565b505050505050565b5f6060820190506102c15f830184610258565b9291505056fea264697066735822122081df48764ee143dcf3f308363b22f4e12f1cb6026ee25e6c06cbf9b521ed9d0b64736f6c634300081a0033'

    await node.chain.blockchainDb.stateManager.checkpoint()
    await node.chain.blockchainDb.stateManager.putAccount(senderAddress, senderAccount)
    await node.chain.blockchainDb.stateManager.commit()

    const senderBalance =
      (await node.chain.blockchainDb.stateManager.getAccount(senderAddress))?.balance ?? 0n
    this.log(
      `Sender account at address ${senderAddress.toString()} has balance ${senderBalance}`,
    )

    const tx = new LegacyTransaction({
      gasLimit: 64646n,
      gasPrice: 7n,
      data,
    })

    this.log(
      `Sending ${tx.value} from ${senderAddress.toString()} to ${recipientAddress.toString()}`,
    )
    const result = await evm.runTx({ tx: tx.sign(senderPrivateKey) })
    this.log(`Amount spent for gas: ${result.amountSpent}`)
    this.log(`Created address: ${result.createdAddress?.toString()}`)

    const globalContractAddress = result.createdAddress

    const utxoI = new ethers.utils.Interface(ABI)
    const data2 = utxoI.encodeFunctionData('shield_test', [])

    const tx2 = new LegacyTransaction({
      gasLimit: 64646n,
      to: globalContractAddress,
      gasPrice: 7n,
      data: data2,
    })

    this.log(
      `Sending ${tx.value} from ${senderAddress.toString()} to ${recipientAddress.toString()}`,
    )
    const result2 = await evm.runTx({ tx: tx2.sign(senderPrivateKey) })
    for (const log of result2.receipt.logs) {
      this.log(`Amount spent for gas: ${log[2].toString()}`)
    }

    await node.closeDB()
  }
}
