/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { isValidAddress } from '@ethereumjs/util'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class EvmBalanceCommand extends IronfishCommand {
  static description = `Displays an account's unshielded balance`

  static flags = {
    ...RemoteFlags,
    address: Flags.string({
      char: 'a',
      description: 'EVM address of account to get unshielded balance for',
      required: true,
    }),
    confirmations: Flags.integer({
      required: false,
      description: 'Minimum number of blocks confirmations for a transaction',
    }),
    // TODO(hughy): add support for custom tokens
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(EvmBalanceCommand)

    const address = flags.address

    if (!isValidAddress(address)) {
      this.error('Invalid Ethereum address')
    }

    const client = await this.sdk.connectRpc()

    const status = await client.wallet.getNodeStatus()

    const headSequence = status.content.blockchain.head.sequence

    const confirmations = flags.confirmations ?? this.sdk.config.get('confirmations')

    const unconfirmed = await client.eth.getAccount({
      address,
      blockReference: String(headSequence),
    })

    if (!unconfirmed) {
      this.error(`No account found with address ${address}`)
    }

    const confirmed = await client.eth.getAccount({
      address,
      blockReference: String(headSequence - confirmations),
    })

    this.log(`EVM Address:         ${address}`)
    this.log(`Unconfirmed Balance: ${unconfirmed.content.balance}`)
    this.log(`Confirmed Balance:   ${confirmed.content.balance}`)
  }
}
