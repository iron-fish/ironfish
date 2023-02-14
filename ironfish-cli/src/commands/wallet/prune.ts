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
<<<<<<< HEAD
=======
    await node.wallet.open()
    await node.wallet.walletDb.open()
>>>>>>> 2ffa2eed (Create wallet:prune)
    CliUx.ux.action.stop('Done.')

    if (!node.chain.synced) {
      this.log(
        `Your node must be synced with the Iron Fish network to prune wallet transactions. Please try again later`,
      )
      this.exit(1)
    }

    const walletHeadHash = await node.wallet.getLatestHeadHash()

    if (walletHeadHash === null) {
      this.log(`Failed to get latest head hash.`)
      this.exit(1)
      return
    }

    const head = await node.chain.getHeader(walletHeadHash)

    if (head === null) {
      this.log(`Failed to get chain header.`)
      this.exit(1)
      return
    }

    for (const account of node.wallet.listAccounts()) {
      let count = 0

      for await (const { transaction } of account.getExpiredTransactions(head.sequence)) {
        count = +1
        this.log(
          `Account ${account.displayName} has expired transaction with hash ${transaction
            .hash()
            .toString('hex')}`,
        )
        if (flags.dryrun === false) {
          await account.deleteTransaction(transaction)
        }
      }

      if (count > 0) {
        this.log(`Account ${account.displayName} has ${count} expired transactions`)
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
