/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Args } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import * as ui from '../../../ui'

export default class TransactionsDelete extends IronfishCommand {
  static description = 'delete an expired or pending transaction from the wallet'

  static args = {
    transaction: Args.string({
      required: true,
      description: 'Hash of the transaction to delete from the wallet',
    }),
  }

  async start(): Promise<void> {
    const { args } = await this.parse(TransactionsDelete)
    const { transaction } = args

    const client = await this.connectRpc()
    await ui.checkWalletUnlocked(client)

    const response = await client.wallet.deleteTransaction({ hash: transaction })

    if (response.content.deleted) {
      this.log(`Transaction ${transaction} deleted from wallet`)
    } else {
      this.error(
        `Transaction ${transaction} was not deleted. Either it is on a block already or does not exist`,
      )
    }
  }
}
