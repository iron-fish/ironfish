/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { LegacyTransaction } from '@ethereumjs/tx'
import { Account, Address } from '@ethereumjs/util'
import { Asset, generateKey } from '@ironfish/rust-nodejs'
import { Assert, ContractArtifact, IronfishEvm } from '@ironfish/sdk'
import { ethers } from 'ethers'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'

export class TestEvmCommand extends IronfishCommand {
  static description = `Test adding EVM support to the Iron Fish network`

  static flags = { ...LocalFlags }

  async start(): Promise<void> {
    const node = await this.sdk.node()
    await node.openDB()

    const evm = new IronfishEvm(node.chain.blockchainDb)
    await evm.open()

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
      data: ContractArtifact.bytecode,
    })

    const result = await evm.runTx({ tx: tx.sign(senderPrivateKey) })

    const globalContractAddress = result.createdAddress

    if (!globalContractAddress) {
      this.error('Contract creation of address failed')
    }

    const contract = await node.chain.blockchainDb.stateManager.getAccount(
      globalContractAddress,
    )

    if (!contract) {
      this.error('Contract creation failed')
    }

    this.log(`Contract created at: ${globalContractAddress.toString()}`)

    const globalContract = new ethers.Interface(ContractArtifact.abi)

    const data2 = globalContract.encodeFunctionData('shield', [
      Buffer.from(senderKey.publicAddress, 'hex'),
      Asset.nativeId(),
      100n,
    ])

    const tx2 = new LegacyTransaction({
      nonce: 1n,
      gasLimit: 100_000n,
      to: globalContractAddress,
      data: data2,
    })

    const result2 = await evm.runTx({ tx: tx2.sign(senderPrivateKey) })

    Assert.isEqual(result2.receipt.logs.length, 1)

    const log = result2.receipt.logs[0]

    this.log('Contract Address')
    this.log(Buffer.from(log[0]).toString('hex'))

    // logging topics
    for (const topic of log[1]) {
      this.log(Buffer.from(topic).toString('ascii'))
    }

    const [ironfishAddress, assetId, caller, amount] = globalContract.decodeEventLog(
      'Shield',
      log[2],
    )
    Assert.isEqual(ironfishAddress as string, '0x' + senderKey.publicAddress)

    Assert.isEqual(assetId as string, '0x' + Asset.nativeId().toString('hex'))

    Assert.isEqual((caller as string).toUpperCase(), senderAddress.toString().toUpperCase())
    Assert.isEqual(amount as bigint, 100n)

    await node.closeDB()
  }
}
