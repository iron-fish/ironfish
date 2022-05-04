/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IronfishNode, NodeUtils } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import fsAsync from 'fs/promises'
import { IronfishCommand } from '../command'
import {
  ConfigFlag,
  ConfigFlagKey,
  DatabaseFlag,
  DatabaseFlagKey,
  DataDirFlag,
  DataDirFlagKey,
  VerboseFlag,
  VerboseFlagKey,
} from '../flags'

export default class Reset extends IronfishCommand {
  static description = 'Reset the node to a fresh state but preserve accounts'

  static flags = {
    [VerboseFlagKey]: VerboseFlag,
    [ConfigFlagKey]: ConfigFlag,
    [DataDirFlagKey]: DataDirFlag,
    [DatabaseFlagKey]: DatabaseFlag,
    confirm: Flags.boolean({
      default: false,
      description: 'confirm without asking',
    }),
  }

  node: IronfishNode | null = null

  async start(): Promise<void> {
    const { flags } = await this.parse(Reset)

    let confirmed = flags.confirm

    const warningMessage =
      `\n/!\\ WARNING: This will permanently delete your accounts. You can back them up by loading the previous version of ironfish and running ironfish export. /!\\\n` +
      '\nHave you read the warning? (Y)es / (N)o'

    confirmed = flags.confirm || (await CliUx.ux.confirm(warningMessage))

    if (!confirmed) {
      this.exit(1)
    }

    const accountDatabasePath = this.sdk.config.accountDatabasePath
    const chainDatabasePath = this.sdk.config.chainDatabasePath

    const message =
      '\nYou are about to destroy your node databases. The following directories will be deleted:\n' +
      `\nAccounts: ${accountDatabasePath}` +
      `\nBlockchain: ${chainDatabasePath}` +
      `\n\nAre you sure? (Y)es / (N)o`

    confirmed = flags.confirm || (await CliUx.ux.confirm(message))

    if (!confirmed) {
      this.exit(1)
    }

    CliUx.ux.action.start('Deleting databases...')

    await Promise.all([
      fsAsync.rm(accountDatabasePath, { recursive: true, force: true }),
      fsAsync.rm(chainDatabasePath, { recursive: true, force: true }),
    ])

    // Re-initialize the databases
    const node = await this.sdk.node()
    await NodeUtils.waitForOpen(node)
    node.internal.set('isFirstRun', true)
    await node.internal.save()

    CliUx.ux.action.stop('Reset the node successfully.')
  }
}
