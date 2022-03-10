/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IronfishNode, NodeUtils, PeerNetwork } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import fs from 'fs'
import fsAsync from 'fs/promises'
import path from 'path'
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

  peerNetwork: PeerNetwork | null = null

  async start(): Promise<void> {
    const { flags } = await this.parse(Reset)

    let node = await this.sdk.node({ autoSeed: false })
    await NodeUtils.waitForOpen(node, null, { upgrade: false, load: false })

    const backupPath = path.join(this.sdk.config.dataDir, 'accounts.backup.json')

    if (fs.existsSync(backupPath)) {
      this.log(`There is already an account backup at ${backupPath}`)

      const confirmed = await CliUx.ux.confirm(
        `\nThis means this failed to run. Delete the accounts backup?\nAre you sure? (Y)es / (N)o`,
      )

      if (!confirmed) {
        this.exit(1)
      }

      fs.rmSync(backupPath)
    }

    const confirmed =
      flags.confirm ||
      (await CliUx.ux.confirm(
        `\nYou are about to destroy your node data at ${node.config.dataDir}\nAre you sure? (Y)es / (N)o`,
      ))

    if (!confirmed) {
      return
    }

    const accounts = node.accounts.listAccounts()
    this.log(`Backing up ${accounts.length} accounts to ${backupPath}`)
    const backup = JSON.stringify(accounts, undefined, '  ')
    await fsAsync.writeFile(backupPath, backup)
    await node.closeDB()

    CliUx.ux.action.start('Deleting databases')

    await Promise.all([
      fsAsync.rm(node.config.accountDatabasePath, { recursive: true }),
      fsAsync.rm(node.config.chainDatabasePath, { recursive: true }),
    ])

    CliUx.ux.action.status = `Importing ${accounts.length} accounts`

    // We create a new node because the old node has cached account data
    node = await this.sdk.node()
    await node.openDB()
    await Promise.all(accounts.map((a) => node.accounts.importAccount(a)))
    await node.closeDB()

    node.internal.set('isFirstRun', true)
    await node.internal.save()

    await fsAsync.rm(backupPath)

    CliUx.ux.action.stop('Reset the node successfully.')
  }
}
