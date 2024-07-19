/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Account, Address } from '@ethereumjs/util'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'

export class PutAccountTestEvmCommand extends IronfishCommand {
  static description = `Test adding EVM support to the Iron Fish network`

  static flags = {
    ...LocalFlags,
    spenderKey: Flags.string({
      char: 's',
      description: 'Spending key of account to set EVM account value for',
    }),
    address: Flags.string({
      char: 'a',
      description: 'EVM address of account to set public IRON balance for',
    }),
    balance: Flags.integer({
      char: 'b',
      description: 'Balance for EVM account',
      required: true,
    }),
    nonce: Flags.integer({
      char: 'n',
      description: 'Nonce for EVM account',
      required: true,
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(PutAccountTestEvmCommand)

    let address
    if (flags.spenderKey) {
      address = Address.fromPrivateKey(Buffer.from(flags.spenderKey, 'hex'))
    } else if (flags.address) {
      address = Address.fromString(flags.address)
    } else {
      this.error('Must provider either a spenderKey or EVM address')
    }

    const account = new Account(BigInt(flags.nonce), BigInt(flags.balance))

    const node = await this.sdk.node()
    await node.openDB()

    await node.chain.blockchainDb.stateManager.checkpoint()
    await node.chain.blockchainDb.stateManager.putAccount(address, account)
    await node.chain.blockchainDb.stateManager.commit()

    if (!account) {
      this.log(`No account found with address ${address.toString()}`)
    } else {
      this.log(`Account balance for address ${address.toString()}: ${account.balance}`)
    }
  }
}
