/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { LegacyTransaction } from '@ethereumjs/tx'
import { Account, Address } from '@ethereumjs/util'
import { Asset, generateKey } from '@ironfish/rust-nodejs'
import { IronfishEvm } from '@ironfish/sdk'
import { ethers } from 'ethers'
import { IronfishCommand } from '../command'
import { LocalFlags } from '../flags'

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

    const senderAccount = new Account(BigInt(0), 500_000_000n)

    const data =
      '0x608060405234801561001057600080fd5b50610266806100206000396000f3fe608060405234801561001057600080fd5b506004361061002b5760003560e01c8063d11f8ef214610030575b600080fd5b61004a60048036038101906100459190610131565b61004c565b005b7fb139e56ef7079605e6e282a1bf7f748db012f96ca0dc4752f5e4cc8b3bf8e6a983838360405161007f939291906101fe565b60405180910390a1505050565b600080fd5b600080fd5b600080fd5b600080fd5b600080fd5b60008083601f8401126100bb576100ba610096565b5b8235905067ffffffffffffffff8111156100d8576100d761009b565b5b6020830191508360018202830111156100f4576100f36100a0565b5b9250929050565b6000819050919050565b61010e816100fb565b811461011957600080fd5b50565b60008135905061012b81610105565b92915050565b60008060006040848603121561014a5761014961008c565b5b600084013567ffffffffffffffff81111561016857610167610091565b5b610174868287016100a5565b935093505060206101878682870161011c565b9150509250925092565b600082825260208201905092915050565b82818337600083830152505050565b6000601f19601f8301169050919050565b60006101ce8385610191565b93506101db8385846101a2565b6101e4836101b1565b840190509392505050565b6101f8816100fb565b82525050565b600060408201905081810360008301526102198185876101c2565b905061022860208301846101ef565b94935050505056fea2646970667358221220bf45db8ce66080006afcfd15be5e8d1e9b1d098840c6f46e91c2bf1b2126e8a364736f6c63430008180033'

    await node.chain.blockchainDb.stateManager.checkpoint()
    await node.chain.blockchainDb.stateManager.putAccount(senderAddress, senderAccount)
    await node.chain.blockchainDb.stateManager.commit()

    const senderBalance =
      (await node.chain.blockchainDb.stateManager.getAccount(senderAddress))?.balance ?? 0n
    this.log(
      `Sender account at address ${senderAddress.toString()} has balance ${senderBalance}`,
    )

    const tx = new LegacyTransaction({
      gasLimit: 646_400n,
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

    const contract = new ethers.Interface([
      {
        inputs: [],
        stateMutability: 'nonpayable',
        type: 'constructor',
      },
      {
        anonymous: false,
        inputs: [
          {
            indexed: false,
            internalType: 'string',
            name: 'assetId',
            type: 'string',
          },
          {
            indexed: false,
            internalType: 'uint256',
            name: 'amount',
            type: 'uint256',
          },
        ],
        name: 'Shield',
        type: 'event',
      },
      {
        inputs: [
          {
            internalType: 'string',
            name: 'assetId',
            type: 'string',
          },
          {
            internalType: 'uint256',
            name: 'amount',
            type: 'uint256',
          },
        ],
        name: 'shield',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
    ])

    const shieldTransactionData = contract.encodeFunctionData('shield', [
      Asset.nativeId().toString('hex'),
      100n,
    ])

    const shieldTransaction = new LegacyTransaction({
      gasLimit: 646_400n,
      to: globalContractAddress,
      gasPrice: 7n,
      data: shieldTransactionData,
      nonce: 1n,
    })

    this.log(
      `Sending ${tx.value} from ${senderAddress.toString()} to ${recipientAddress.toString()}`,
    )
    const result2 = await evm.runTx({ tx: shieldTransaction.sign(senderPrivateKey) })
    for (const log of result2.receipt.logs) {
      const address = '0x' + Buffer.from(log[0]).toString('hex')
      const decodedLog = contract.decodeEventLog('Shield', Buffer.from(log[2]))
      const assetId: string = decodedLog[0] as string
      const amount: number = decodedLog[1] as number

      this.log(`Address: ${address}`)
      this.log(`Asset ID: ${assetId}`)
      this.log(`Amount: ${amount}`)
    }

    await node.closeDB()
  }
}
