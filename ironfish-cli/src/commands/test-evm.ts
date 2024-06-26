/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { LegacyTransaction } from '@ethereumjs/tx'
import { Account, Address } from '@ethereumjs/util'
import { generateKey } from '@ironfish/rust-nodejs'
import { IronfishEvm } from '@ironfish/sdk/src/evm'
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

    const senderAccount = new Account(BigInt(0), 500000n)

    await evm.stateManager.checkpoint()
    await evm.stateManager.putAccount(senderAddress, senderAccount)
    await evm.stateManager.commit()

    let senderBalance = (await evm.stateManager.getAccount(senderAddress))?.balance ?? 0n
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

    const recipientBalance =
      (await evm.stateManager.getAccount(recipientAddress))?.balance ?? 0n
    this.log(
      `Recipient at address ${recipientAddress.toString()} has balance ${recipientBalance}`,
    )

    await node.closeDB()
  }
}
