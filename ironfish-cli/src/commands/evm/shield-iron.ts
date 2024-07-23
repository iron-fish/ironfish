/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { LegacyTransaction } from '@ethereumjs/tx'
import { Account, Address } from '@ethereumjs/util'
import { Asset, generateKey } from '@ironfish/rust-nodejs'
import {
  Assert,
  ContractArtifact,
  EvmShield,
  GLOBAL_CONTRACT_ADDRESS,
  IronfishEvm,
} from '@ironfish/sdk'
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

    const senderAccount = new Account(BigInt(0), 10n)

    await node.chain.blockchainDb.stateManager.checkpoint()
    await node.chain.blockchainDb.stateManager.putAccount(senderAddress, senderAccount)
    await node.chain.blockchainDb.stateManager.commit()

    const contract = await node.chain.blockchainDb.stateManager.getAccount(
      GLOBAL_CONTRACT_ADDRESS,
    )

    if (!contract) {
      this.error('Contract creation failed')
    }

    this.log(`Contract created at: ${GLOBAL_CONTRACT_ADDRESS.toString()}`)

    const globalContract = new ethers.Interface(ContractArtifact.abi)

    const data = globalContract.encodeFunctionData('shield_iron', [
      Buffer.from(senderKey.publicAddress, 'hex'),
    ])

    const tx = new LegacyTransaction({
      nonce: 0n,
      gasLimit: 100_000n,
      value: 10n,
      to: GLOBAL_CONTRACT_ADDRESS,
      data: data,
    })

    const result = await evm.runTx({ tx: tx.sign(senderPrivateKey) })

    const logEvents = evm.decodeLogs(result.receipt.logs)

    Assert.isEqual(logEvents.length, 1)
    const log = logEvents[0] as EvmShield

    this.log('Contract Address')
    this.log(log.caller.toString())

    const native = Asset.nativeId().toString('hex')
    Assert.isEqual(log.ironfishAddress.toString('hex'), senderKey.publicAddress)
    Assert.isEqual(log.assetId.toString('hex'), native)
    Assert.isEqual(
      log.caller.toString().toUpperCase(),
      GLOBAL_CONTRACT_ADDRESS.toString().toUpperCase(),
    )
    Assert.isEqual(log.amount, 10n)

    await node.closeDB()
  }
}
