/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Address } from '@ethereumjs/util'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'

export class GetAccountTestEvmCommand extends IronfishCommand {
  static description = `Test adding EVM support to the Iron Fish network`

  static flags = {
    ...LocalFlags,
    address: Flags.string({
      char: 'a',
      description: 'EVM address of account to get public IRON balance for',
      required: true,
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(GetAccountTestEvmCommand)

    const node = await this.sdk.node()
    await node.openDB()

    const address = Address.fromString(flags.address)

    const account = await node.chain.blockchainDb.stateManager.getAccount(address)

    if (!account) {
      this.log(`No account found with address ${address.toString()}`)
    } else {
      this.log(`Account balance for address ${address.toString()}: ${account.balance}`)
      this.log(`Account nonce for address ${address.toString()}: ${account.nonce}`)
    }
  }
}
