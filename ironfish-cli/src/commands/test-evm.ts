/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// import { LegacyTransaction } from '@ethereumjs/tx'
import { LegacyTransaction } from '@ethereumjs/tx'
import { Account, Address, hexToBytes } from '@ethereumjs/util'
import { generateKey } from '@ironfish/rust-nodejs'
import { IronfishEvm } from '@ironfish/sdk'
import { IronfishCommand } from '../command'
import { LocalFlags } from '../flags'

export class TestEvmCommand extends IronfishCommand {
  static description = `Test adding EVM support to the Iron Fish network`

  static flags = { ...LocalFlags }

  async start(): Promise<void> {
    const node = await this.sdk.node()
    await node.openDB()

    const evm = await IronfishEvm.create(node.chain.blockchainDb)

    // const senderAddress = new Address(hexToBytes('0x0e5069fd80d59b92e359dade34f6a66f0bf8dcc5'))

    const senderKey = generateKey()
    const receipientKey = generateKey()

    const senderPrivateKey = Uint8Array.from(Buffer.from(senderKey.spendingKey, 'hex'))
    const recipientPrivateKey = Uint8Array.from(Buffer.from(receipientKey.spendingKey, 'hex'))

    const senderAddress = Address.fromPrivateKey(senderPrivateKey)
    const recipientAddress = Address.fromPrivateKey(recipientPrivateKey)

    let senderBalance = (await evm.stateManager.getAccount(senderAddress))?.balance ?? 0n
    this.log(
      `Sender account at address ${senderAddress.toString()} has balance ${senderBalance}`,
    )

    const senderAccount = new Account(BigInt(0), senderBalance + 500000n)

    const oldStateRoot = await evm.stateManager.getStateRoot()
    this.log(`Old state root: ${Buffer.from(oldStateRoot).toString('hex')}`)

    await evm.stateManager.checkpoint()
    await evm.stateManager.putAccount(senderAddress, senderAccount)
    await evm.stateManager.commit()

    let newStateRoot = await evm.stateManager.getStateRoot()
    this.log(`New state root: ${Buffer.from(newStateRoot).toString('hex')}`)

    senderBalance = (await evm.stateManager.getAccount(senderAddress))?.balance ?? 0n
    this.log(
      `Sender account at address ${senderAddress.toString()} has balance ${senderBalance}`,
    )

    const tx = new LegacyTransaction({
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

    let recipientBalance = (await evm.stateManager.getAccount(recipientAddress))?.balance ?? 0n
    this.log(
      `Recipient at address ${recipientAddress.toString()} has balance ${recipientBalance}`,
    )

    newStateRoot = await evm.stateManager.getStateRoot()
    this.log(`New state root: ${Buffer.from(newStateRoot).toString('hex')}`)

    await evm.stateManager.setStateRoot(oldStateRoot)

    senderBalance = (await evm.stateManager.getAccount(senderAddress))?.balance ?? 0n
    this.log(`Sender at address ${recipientAddress.toString()} has balance ${senderBalance}`)

    recipientBalance = (await evm.stateManager.getAccount(recipientAddress))?.balance ?? 0n
    this.log(
      `Recipient at address ${recipientAddress.toString()} has balance ${recipientBalance}`,
    )

    await node.closeDB()
  }
}
