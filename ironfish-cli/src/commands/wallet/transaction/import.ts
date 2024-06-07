/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Args, Flags, ux } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'
import { importFile, importPipe, longPrompt } from '../../../utils/input'

export class TransactionImportCommand extends IronfishCommand {
  static description = `Import a transaction into your wallet`

  static aliases = ['wallet:transaction:add']

  static flags = {
    ...RemoteFlags,
    path: Flags.string({
      description: 'Path to a file containing the transaction to import',
    }),
    broadcast: Flags.boolean({
      default: true,
      allowNo: true,
      description: 'Broadcast the transaction to the network after importing',
    }),
  }

  static args = {
    transaction: Args.string({
      required: false,
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      description: 'The transaction in hex encoding',
    }),
  }

  async start(): Promise<void> {
    const { flags, args } = await this.parse(TransactionImportCommand)
    const txArg = args.transaction

    let transaction

    if (txArg && txArg.length !== 0 && flags.path && flags.path.length !== 0) {
      this.error(
        `Your command includes an unexpected argument. Please pass either --path or a hex-encoded transaction`,
      )
    }

    if (txArg) {
      transaction = txArg
    } else if (flags.path) {
      transaction = await importFile(this.sdk.fileSystem, flags.path)
    } else if (process.stdin.isTTY) {
      transaction = await longPrompt('Paste the hex-encoded transaction to import', {
        required: true,
      })
    } else if (!process.stdin.isTTY) {
      transaction = await importPipe()
    } else {
      ux.error(`Invalid import type`)
    }

    ux.action.start(`Importing transaction`)
    const client = await this.sdk.connectRpc()
    const response = await client.wallet.addTransaction({
      transaction,
      broadcast: flags.broadcast,
    })
    ux.action.stop()

    this.log(`Transaction imported for accounts: ${response.content.accounts.join(', ')}`)
  }
}
