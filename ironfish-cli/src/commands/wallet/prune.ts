/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NodeUtils } from '@ironfish/sdk'
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
    const node = await this.sdk.node()
    await NodeUtils.waitForOpen(node)
    CliUx.ux.action.stop('Done.')

    for (const account of node.wallet.listAccounts()) {
      this.log(`Process Account ${account.displayName}.`)

      const head = await account.getHead()
      if (head !== null) {
        let count = 0

        for await (const transactionValue of account.getExpiredTransactions(head.sequence)) {
          count = +1
          this.log(`transaction ${transactionValue.transaction.hash().toString('hex')}.`)

          if (flags.dryrun === false) {
            await account.deleteTransaction(transactionValue.transaction)
          }
        }

        if (count > 0) {
          this.log(`Account ${account.displayName} has ${count} expired transactions`)
        }
      }
    }

    if (flags.compact) {
      CliUx.ux.action.start(`Compacting wallet database`)
      await node.wallet.walletDb.db.compact()
      CliUx.ux.action.stop()
    }

    await node.closeDB()
  }
}
