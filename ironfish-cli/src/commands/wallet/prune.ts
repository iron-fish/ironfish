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

    if (flags.compact) {
      CliUx.ux.action.start(`Compacting wallet database`)
      await node.wallet.walletDb.db.compact()
      CliUx.ux.action.stop()
    }

<<<<<<< HEAD
    await node.closeDB()
=======
    await node.wallet.walletDb.close()
    await node.wallet.close()
>>>>>>> 2ffa2eed (Create wallet:prune)
  }
}
