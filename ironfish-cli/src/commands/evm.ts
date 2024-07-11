/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Account, Address, hexToBytes } from '@ethereumjs/util'
import { Assert, EvmState } from '@ironfish/sdk'
import { IronfishCommand } from '../command'
import { LocalFlags } from '../flags'

export class TestEvmCommand extends IronfishCommand {
  static description = `Test adding EVM support to the Iron Fish network`
  static flags = { ...LocalFlags }

  async start(): Promise<void> {
    const node = await this.sdk.node()
    await node.openDB()
    const blockchainDb = node.chain.blockchainDb
    const evmState: EvmState = new EvmState(blockchainDb.db)
    await evmState.init()

    Assert.isNotNull(evmState.manager)

    const stateManager = evmState.manager

    const address = new Address(hexToBytes('0xa94f5374fce5edbc8e2a8697c15331677e6ebf0b'))
    const account = new Account(BigInt(0), BigInt(1000))
    await stateManager.checkpoint()
    await stateManager.putAccount(address, account)
    await stateManager.commit()
    await stateManager.flush()

    const balance = (await evmState.manager.getAccount(address))?.balance ?? 0n
    this.log(`Account at address ${address.toString()} has balance ${balance}`)

    await node.closeDB()
  }
}
