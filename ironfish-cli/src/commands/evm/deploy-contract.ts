/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { LegacyTransaction } from '@ethereumjs/tx'
import { Account, Address } from '@ethereumjs/util'
import { generateKey } from '@ironfish/rust-nodejs'
import { IronfishEvm } from '@ironfish/sdk'
import { ethers } from 'ethers'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'
import { ABI, DEPLOY_DATA } from './global_contract'

export class TestEvmCommand extends IronfishCommand {
  static description = `Test adding EVM support to the Iron Fish network`

  static flags = { ...LocalFlags }

  async start(): Promise<void> {
    const node = await this.sdk.node()
    await node.openDB()

    const evm = await IronfishEvm.create(node.chain.blockchainDb)

    const senderKey = generateKey()
    const senderPrivateKey = Uint8Array.from(Buffer.from(senderKey.spendingKey, 'hex'))
    const senderAddress = Address.fromPrivateKey(senderPrivateKey)

    const senderAccount = new Account(BigInt(0), 0n)

    await node.chain.blockchainDb.stateManager.checkpoint()
    await node.chain.blockchainDb.stateManager.putAccount(senderAddress, senderAccount)
    await node.chain.blockchainDb.stateManager.commit()

    // Deploy the global contract
    const tx = new LegacyTransaction({
      gasLimit: 1_000_000n,
      data: DEPLOY_DATA,
    })

    const result = await evm.runTx({ tx: tx.sign(senderPrivateKey) })

    const globalContractAddress = result.createdAddress

    if (!globalContractAddress) {
      this.error('Contract creation of address failed')
      return
    }

    const contract = await node.chain.blockchainDb.stateManager.getAccount(
      globalContractAddress,
    )

    if (!contract) {
      this.error('Contract creation failed')
      return
    }

    this.log(`Contract created at: ${globalContractAddress.toString()}`)

    const utxoI = new ethers.Interface(ABI)
    const data2 = utxoI.encodeFunctionData('shield_test', [])

    const tx2 = new LegacyTransaction({
      nonce: 1n,
      gasLimit: 100_000n,
      to: globalContractAddress,
      data: data2,
    })

    const result2 = await evm.runTx({ tx: tx2.sign(senderPrivateKey) })
    for (const log of result2.receipt.logs) {
      this.log(`Log Output: ${Buffer.from(log[2]).toString('ascii')}`)
    }

    await node.closeDB()
  }
}
