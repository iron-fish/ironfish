/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NodeUtils, TransactionStatus } from '@ironfish/sdk'
import { Args, ux } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'

export default class TransactionsDelete extends IronfishCommand {
  static description = 'delete an expired or pending transaction from the wallet'

  static args = {
    transaction: Args.string({
      required: true,
      description: 'Hash of the transaction to delete from the wallet',
    }),
  }

  static flags = {
    ...RemoteFlags,
  }

  async start(): Promise<void> {
    const { args } = await this.parse(TransactionsDelete)
    const { transaction } = args

    ux.action.start('Opening node')
    const node = await this.sdk.node()
    await NodeUtils.waitForOpen(node)
    ux.action.stop('Done.')

    const accounts = node.wallet.accounts
    const transactionHash = Buffer.from(transaction, 'hex')
    let deleted = false

    for (const account of accounts) {
      const transactionValue = await account.getTransaction(transactionHash)

      if (transactionValue == null) {
        continue
      }

      const transactionStatus = await node.wallet.getTransactionStatus(
        account,
        transactionValue,
      )

      if (
        transactionStatus === TransactionStatus.CONFIRMED ||
        transactionStatus === TransactionStatus.UNCONFIRMED
      ) {
        this.error(`Transaction ${transaction} is already on a block, so it cannot be deleted`)
      }

      if (
        transactionStatus === TransactionStatus.EXPIRED ||
        transactionStatus === TransactionStatus.PENDING
      ) {
        await account.deleteTransaction(transactionValue.transaction)
        deleted = true
      }
    }

    if (deleted) {
      this.log(`Transaction ${transaction} deleted from wallet`)
    } else {
      this.log(`No transaction with hash ${transaction} found in wallet`)
    }
  }
}
