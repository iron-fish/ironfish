/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NodeUtils, TransactionStatus } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'

export default class PruneCommand extends IronfishCommand {
  static description = 'Removes expired transactions from the wallet'

  static hidden = false

  static flags = {
    ...LocalFlags,
    dryrun: Flags.boolean({
      default: false,
      description: 'Dry run prune first',
    }),
    expire: Flags.boolean({
      char: 'e',
      default: true,
      allowNo: true,
      description: 'Delete expired transactions from the wallet',
    }),
    compact: Flags.boolean({
      char: 'c',
      default: true,
      allowNo: true,
      description: 'Compact the database',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(PruneCommand)

    CliUx.ux.action.start(`Opening node`)
    const node = await this.sdk.walletNode()
    await NodeUtils.waitForOpen(node)
    CliUx.ux.action.stop('Done.')

    if (flags.expire) {
      for (const account of node.wallet.listAccounts()) {
        const head = await account.getHead()

        if (head !== null) {
          this.log(`Process Account ${account.displayName}.`)

          let count = 0

          for await (const transactionValue of account.getTransactions()) {
            const status = await node.wallet.getTransactionStatus(account, transactionValue)

            if (status === TransactionStatus.EXPIRED) {
              count = +1

              if (flags.dryrun === false) {
                await account.deleteTransaction(transactionValue.transaction)
              }
            }
          }

          this.log(`Account ${account.displayName} has ${count} expired transactions`)
        }
      }
    }

    CliUx.ux.action.start(`Cleaning up deleted accounts`)
    await node.wallet.forceCleanupDeletedAccounts()
    CliUx.ux.action.stop()

    if (flags.compact) {
      CliUx.ux.action.start(`Compacting wallet database`)
      await node.wallet.walletDb.db.compact()
      CliUx.ux.action.stop()
    }

    await node.closeDB()
  }
}
