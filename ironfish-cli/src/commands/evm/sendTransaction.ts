/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { LegacyTransaction } from '@ethereumjs/tx'
import { Assert } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'

export class SendTransactionTestEvmCommand extends IronfishCommand {
  static description = `Test adding EVM support to the Iron Fish network`

  static flags = {
    ...LocalFlags,
    senderKey: Flags.string({
      char: 's',
      description: 'Spending key of account to send transaction from',
      required: true,
    }),
    recipientAddress: Flags.string({
      char: 'r',
      description: 'EVM address to send transaction to',
      required: true,
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

    const senderKey = Buffer.from(flags.senderKey, 'hex')

    const recipientAddress = flags.recipientAddress

    const tx = new LegacyTransaction({
      to: recipientAddress,
      value: BigInt(flags.value),
      gasLimit: 21000n,
      nonce: flags.nonce,
      gasPrice: 1n,
    })
    tx.sign(senderKey)

    const response = await client.eth.sendRawTransaction({
      transaction: Buffer.from(tx.serialize()).toString('hex'),
    })
    Assert.isNotNull(response.content)

    if (response.content.accepted) {
      this.log('Transaction accepted')
    } else {
      this.log('Transaction not accepted')
    }

    if (response.content.broadcasted) {
      this.log('Transaction broadcasted')
    } else {
      this.log('Transaction not broadcasted')
    }
  }
}
