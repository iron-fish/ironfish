/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { CurrencyUtils, FileUtils } from '@ironfish/sdk'
import { Args } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'
import * as ui from '../../../ui'

export class TransactionInfo extends IronfishCommand {
  static description = 'Display info about a transaction'

  static flags = {
    ...RemoteFlags,
  }

  static args = {
    hash: Args.string({
      required: true,
      description: 'Hash of the transaction',
    }),
  }

  async start(): Promise<void> {
    const { args } = await this.parse(TransactionInfo)

    const client = await this.sdk.connectRpc()

    const response = await client.chain.getTransaction({
      transactionHash: args.hash,
    })

    const transaction = response.content

    this.log(
      ui.card({
        'Block hash': transaction.blockHash,
        'Transaction hash': transaction.hash,
        Fee: CurrencyUtils.render(transaction.fee.toString(), true),
        'Expiration sequence': transaction.expiration,
        'Transaction size': FileUtils.formatMemorySize(transaction.size),
        'Notes output': transaction.notes.length,
        'Notes spent': transaction.spends.length,
        'Mint count': transaction.mints.length,
        'Burn count': transaction.burns.length,
      }),
    )
  }
}
