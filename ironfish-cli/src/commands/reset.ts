/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { flags } from '@oclif/command'
import { IronfishCommand } from '../command'
import path from 'path'
import fs from 'fs'
import fsAsync from 'fs/promises'
import { IronfishNode, PeerNetwork } from 'ironfish'
import cli from 'cli-ux'
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
    confirm: flags.boolean({
      default: false,
      description: 'confirm without asking',
    }),
  }

  node: IronfishNode | null = null

  peerNetwork: PeerNetwork | null = null

  async start(): Promise<void> {
    const { flags } = this.parse(Reset)

    const backupPath = path.join(this.sdk.config.dataDir, 'accounts.backup.json')

    if (fs.existsSync(backupPath)) {
      this.log(`There is already an account backup at ${backupPath}`)
      this.log(
        `\nThat means this failed to run. Delete it manually, or move it somewhere and try again.`,
      )
      this.exit(1)
    }

    let node = await this.sdk.node()

    const confirmed =
      flags.confirm ||
      (await cli.confirm(
        `You are about to destroy your node data at ${node.config.dataDir}\nAre you sure? (Y)es / (N)o`,
      ))

    if (!confirmed) return

    await node.openDB()
    const accounts = node.accounts.listAccounts()
    this.log(`Backing up ${accounts.length} accounts to ${backupPath}`)
    const backup = JSON.stringify(accounts, undefined, '  ')
    await fsAsync.writeFile(backupPath, backup)
    await node.closeDB()

    cli.action.start('Deleting databases')

    await Promise.all([
      fsAsync.rmdir(node.config.accountDatabasePath, { recursive: true }),
      fsAsync.rmdir(node.config.chainDatabasePath, { recursive: true }),
    ])

    cli.action.status = `Importing ${accounts.length} accounts`

    // We create a new node because the old node has cached account data
    node = await this.sdk.node()
    await node.openDB()
    await Promise.all(accounts.map((a) => node.accounts.importAccount(a)))
    await node.closeDB()

    node.internal.set('isFirstRun', true)
    await node.internal.save()

    await fsAsync.rm(backupPath)

    cli.action.stop('Reset the node successfully.')
  }
}
