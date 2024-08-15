/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'

export class SendTransactionTestEvmCommand extends IronfishCommand {
  static description = `Test adding EVM support to the Iron Fish network`

  static flags = {
    ...LocalFlags,
    from: Flags.string({
      char: 'f',
      description: 'Account name to send from',
    }),
    to: Flags.string({
      char: 't',
      description: 'EVM address to send transaction to',
    }),
    data: Flags.string({
      char: 'x',
      description: 'Raw hex data to send in transaction',
    }),
    value: Flags.integer({
      char: 'a',
      description: 'Amount of public IRON to send',
      required: true,
    }),
    nonce: Flags.integer({
      char: 'n',
      description: 'Transaction nonce',
      required: true,
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(SendTransactionTestEvmCommand)
    const client = await this.sdk.connectRpc()

    let from = flags.from
    if (!flags.from) {
      const response = await client.wallet.getAccountPublicKey({ account: flags.from })
      from = response.content.evmPublicAddress
      this.log(`Using public address: ${from}`)
    }
    if (!from) {
      this.error('Account does not exist or have a ethereum public address')
    }

    const response = await client.eth.sendTransaction({
      from,
      to: flags.to,
      value: String(flags.value),
      gas: '10000',
      nonce: String(flags.nonce),
      gasPrice: String(0n),
      data: flags.data,
    })
    this.log(`Transaction hash: ${response.content.result}`)
  }
}
