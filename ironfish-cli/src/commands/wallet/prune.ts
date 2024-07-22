/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NodeUtils, TransactionStatus } from '@ironfish/sdk'
import { Flags, ux } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'

export default class PruneCommand extends IronfishCommand {
  static description = 'Removes expired transactions from the wallet'

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
    account: Flags.string({
      char: 'a',
      description:
        'Name of the account to prune expired transaction for. Prunes all accounts by default',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(PruneCommand)

    ux.action.start(`Opening node`)
    const node = await this.sdk.node()
    await NodeUtils.waitForOpen(node)
    ux.action.stop('Done.')

    let accounts
    if (flags.account) {
      const account = node.wallet.getAccountByName(flags.account)

      if (account === null) {
        this.error(`Wallet does not have an account named ${flags.account}`)
      }

      accounts = [account]
    } else {
      accounts = node.wallet.accounts
    }

    if (flags.expire) {
      for (const account of accounts) {
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

    ux.action.start(`Cleaning up deleted accounts`)
    await node.wallet.forceCleanupDeletedAccounts()
    ux.action.stop()

    if (flags.compact) {
      ux.action.start(`Compacting wallet database`)
      await node.wallet.walletDb.db.compact()
      ux.action.stop()
    }

    await node.closeDB()
  }
}
