/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { HOST_FILE_NAME, IronfishNode } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import fsAsync from 'fs/promises'
import { IronfishCommand } from '../command'
import {
  ConfigFlag,
  ConfigFlagKey,
  DataDirFlag,
  DataDirFlagKey,
  VerboseFlag,
  VerboseFlagKey,
} from '../flags'

export default class Reset extends IronfishCommand {
  static description = 'Reset the node to its initial state'

  static flags = {
    [VerboseFlagKey]: VerboseFlag,
    [ConfigFlagKey]: ConfigFlag,
    [DataDirFlagKey]: DataDirFlag,
    confirm: Flags.boolean({
      default: false,
      description: 'Confirm without asking',
    }),
  }

  node: IronfishNode | null = null

  async start(): Promise<void> {
    const { flags } = await this.parse(Reset)

    let confirmed = flags.confirm

    const warningMessage =
      `\n/!\\ WARNING: This will permanently delete your wallets. You can back them up by loading the previous version of ironfish and running ironfish export. /!\\\n` +
      '\nHave you read the warning? (Y)es / (N)o'

    confirmed = flags.confirm || (await CliUx.ux.confirm(warningMessage))

    if (!confirmed) {
      this.log('Reset aborted.')
      this.exit(0)
    }

    this.sdk.internal.set('networkId', this.sdk.config.defaults.networkId)
    this.sdk.internal.set('isFirstRun', true)
    await this.sdk.internal.save()
    const walletDatabasePath = this.sdk.config.walletDatabasePath
    const chainDatabasePath = this.sdk.config.chainDatabasePath
    const hostFilePath: string = this.sdk.config.files.join(
      this.sdk.config.dataDir,
      HOST_FILE_NAME,
    )

    const message =
      '\nYou are about to destroy your node databases. The following directories and files will be deleted:\n' +
      `\nWallet: ${walletDatabasePath}` +
      `\nBlockchain: ${chainDatabasePath}` +
      `\nHosts: ${hostFilePath}` +
      `\n\nAre you sure? (Y)es / (N)o`

    confirmed = flags.confirm || (await CliUx.ux.confirm(message))

    if (!confirmed) {
      this.log('Reset aborted.')
      this.exit(0)
    }

    CliUx.ux.action.start('Deleting databases...')

    await Promise.all([
      fsAsync.rm(walletDatabasePath, { recursive: true, force: true }),
      fsAsync.rm(chainDatabasePath, { recursive: true, force: true }),
      fsAsync.rm(hostFilePath, { recursive: true, force: true }),
    ])

    CliUx.ux.action.stop('Databases deleted successfully')
  }
}
