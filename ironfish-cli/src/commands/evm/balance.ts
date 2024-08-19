/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '@ironfish/sdk'
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
    }),
    confirmations: Flags.integer({
      required: false,
      description: 'Minimum number of blocks confirmations for a transaction',
    }),
    contract: Flags.string({
      char: 'c',
      description: 'EVM contract address of the asset to shield',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(EvmBalanceCommand)
    const client = await this.sdk.connectRpc()

    let address = flags.address

    if (!address) {
      const response = await client.wallet.getAccountPublicKey({})
      const evmPublicAddress = response.content.evmPublicAddress
      Assert.isNotUndefined(evmPublicAddress, 'No EVM address found for default account')
      address = evmPublicAddress
    }

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
    this.log(`Unconfirmed Balance (IRON): ${unconfirmed.content.balance}`)
    this.log(`Confirmed Balance (IRON):   ${confirmed.content.balance}`)
  }
}
