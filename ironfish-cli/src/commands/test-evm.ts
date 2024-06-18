/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Account, Address, hexToBytes } from '@ethereumjs/util'
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

    const address = new Address(hexToBytes('0xa94f5374fce5edbc8e2a8697c15331677e6ebf0b'))

    let balance = (await evm.evm.stateManager.getAccount(address))?.balance ?? 0n
    this.log(`Account at address ${address.toString()} has balance ${balance}`)

    const account = new Account(BigInt(0), balance + 1000n)

    await evm.evm.stateManager.checkpoint()
    await evm.evm.stateManager.putAccount(address, account)
    await evm.evm.stateManager.commit()

    balance = (await evm.evm.stateManager.getAccount(address))?.balance ?? 0n
    this.log(`Account at address ${address.toString()} has balance ${balance}`)

    await node.closeDB()
  }
}
