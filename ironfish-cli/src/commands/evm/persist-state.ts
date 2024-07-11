/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Account, Address } from '@ethereumjs/util'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'

export class PersistStateTestEvmCommand extends IronfishCommand {
  static description = `Test adding EVM support to the Iron Fish network`

  static flags = { ...LocalFlags }

  async start(): Promise<void> {
    const node = await this.sdk.node()
    await node.openDB()

    const persistentAddress = Address.fromString('0x3c6c6d51f71a0f146cf79843e888feb20258f567')
    const persistentAccount = await node.chain.blockchainDb.stateManager.getAccount(
      persistentAddress,
    )
    const persistentBalance = persistentAccount?.balance ?? 0n
    this.log(
      `Account at address ${persistentAddress.toString()} has balance ${persistentBalance}`,
    )

    await node.chain.blockchainDb.stateManager.checkpoint()
    await node.chain.blockchainDb.stateManager.putAccount(
      persistentAddress,
      new Account(0n, persistentBalance + 1n),
    )
    await node.chain.blockchainDb.stateManager.commit()

    await node.closeDB()
  }
}
